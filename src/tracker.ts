import { config } from "./config";
import { OneEuro } from "./oneEuro";

const cfg = config.tracking;

/**
 * Положение головы в долях кадра (-1..1, край кадра = ±1).
 * Лицо с вебкамеры через BlazeFace в воркере, мышь как запасной вариант.
 * Отдаёт смешанное n: при потере лица держит позу holdMs, потом плавно уходит на мышь.
 */
export class HeadTracker {
  readonly n = { x: 0, y: 0 };
  readonly stats = {
    mode: "mouse" as "camera" | "mouse",
    backend: "none",
    detectMs: 0,
    rawX: 0,
    rawY: 0,
    error: ""
  };

  private mouse = { x: 0, y: 0 };
  private face = { x: 0, y: 0 };
  private hasFace = false;
  private lastFaceMs = -Infinity;
  /** Вес камеры в смеси: 1 камера, 0 мышь. */
  private weight = 0;
  private fx = new OneEuro(cfg.minCutoff, cfg.beta, cfg.dCutoff);
  private fy = new OneEuro(cfg.minCutoff, cfg.beta, cfg.dCutoff);
  private worker: Worker | null = null;
  private video: HTMLVideoElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private waiting = false;
  private lastSendMs = 0;

  constructor() {
    document.addEventListener("pointermove", (e) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.x = cfg.invertXMouse ? -x : x;
      this.mouse.y = 1 - (e.clientY / window.innerHeight) * 2;
    });
  }

  async start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: cfg.videoWidth, height: cfg.videoHeight },
        audio: false
      });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      this.video = video;
    } catch (e) {
      // Нет доступа к камере: тихо остаёмся на мыши.
      this.stats.error = "camera: " + (e instanceof Error ? e.message : String(e));
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = cfg.detectWidth;
    canvas.height = Math.round((cfg.detectWidth * this.video.videoHeight) / Math.max(1, this.video.videoWidth));
    // Программный канвас: getImageData без чтения с видеокарты.
    this.ctx = canvas.getContext("2d", { willReadFrequently: true });

    const worker = new Worker(cfg.workerUrl);
    worker.onmessage = (e) => this.onWorker(e.data);
    worker.onerror = (e) => (this.stats.error = "worker: " + e.message);
    worker.postMessage({ type: "init" });
    this.worker = worker;
  }

  private onWorker(msg: any) {
    if (msg.type === "ready") {
      this.stats.backend = msg.delegate;
      return;
    }
    if (msg.type === "error") {
      this.stats.error = msg.message;
      this.waiting = false;
      return;
    }
    this.waiting = false;
    this.stats.detectMs = msg.detectMs;
    if (msg.type !== "face") return;
    const o = msg.observation;
    const nx = (o.x - 0.5) * 2 * (cfg.invertXCamera ? -1 : 1);
    const ny = (0.5 - o.y) * 2 * (cfg.invertYCamera ? -1 : 1);
    this.stats.rawX = nx;
    this.stats.rawY = ny;
    const t = performance.now();
    const x = this.fx.filter(nx, t);
    const y = this.fy.filter(ny, t);
    // Мёртвая зона с люфтом: значение стоит, пока вход гуляет внутри зоны.
    if (!this.hasFace) {
      this.face.x = x;
      this.face.y = y;
    } else {
      this.face.x = backlash(this.face.x, x, cfg.deadZone);
      this.face.y = backlash(this.face.y, y, cfg.deadZone);
    }
    this.hasFace = true;
    this.lastFaceMs = t;
  }

  /** Вызывать каждый кадр рендера. */
  update(now: number, dtMs: number) {
    this.capture(now);

    const faceFresh = this.hasFace && now - this.lastFaceMs < cfg.holdMs;
    if (faceFresh) this.weight = Math.min(1, this.weight + dtMs / cfg.toCameraMs);
    else this.weight = Math.max(0, this.weight - dtMs / cfg.toMouseMs);
    if (!faceFresh && this.weight === 0 && this.hasFace) {
      // Лицо ушло надолго: следующее появление начнётся с чистого фильтра.
      this.hasFace = false;
      this.fx.reset();
      this.fy.reset();
    }
    this.stats.mode = this.weight > 0.5 ? "camera" : "mouse";

    const w = smoothstep(this.weight);
    this.n.x = this.face.x * w + this.mouse.x * (1 - w);
    this.n.y = this.face.y * w + this.mouse.y * (1 - w);
  }

  private capture(now: number) {
    // До "ready" воркер молча игнорирует кадры, и ожидание ответа зависло бы навсегда.
    if (!this.worker || !this.ctx || !this.video || this.waiting || this.stats.backend === "none") return;
    if (now - this.lastSendMs < 1000 / cfg.maxDetectFps) return;
    if (this.video.readyState < 2) return;
    this.lastSendMs = now;
    const { width, height } = this.ctx.canvas;
    this.ctx.drawImage(this.video, 0, 0, width, height);
    const data = this.ctx.getImageData(0, 0, width, height);
    this.waiting = true;
    this.worker.postMessage(
      { type: "frame", pixels: data.data.buffer, width, height, timeMs: now },
      [data.data.buffer]
    );
  }
}

function backlash(current: number, input: number, zone: number) {
  if (input > current + zone) return input - zone;
  if (input < current - zone) return input + zone;
  return current;
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t);
}
