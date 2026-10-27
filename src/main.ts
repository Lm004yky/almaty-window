import * as THREE from "three";
import "./styles.css";
import { config, current } from "./config";
import { applyProjection, applyWindow, createBackdrop, createSplat, loadStats, view } from "./scene";
import { HeadTracker } from "./tracker";

const D = config.view.windowDistance;
const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
const loading = document.querySelector<HTMLElement>("#loading")!;
const statsEl = document.querySelector<HTMLElement>("#stats")!;

// Пока грузится 3D, на месте окна стоит само фото: кадр тот же, что у сцены в покое.
loading.style.setProperty("--photo", `url(${current.base}photo.jpg)`);
loading.style.setProperty("--overscan", String(config.scene.overscan));

document.title = current.title;
document.querySelector(".logo")!.textContent = current.title;
document.querySelector(".hero h1")!.textContent = current.title;
document.querySelector(".hero-copy p")!.textContent = current.copy;
document.querySelectorAll(".site-header nav a").forEach((a, i) => {
  const id = Object.keys(config.scenes)[i];
  a.textContent = id[0].toUpperCase() + id.slice(1);
  // Ссылки шапки переключают сцены.
  a.setAttribute("href", "?scene=" + id);
});

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
// pixelRatio выставляется один раз: смена на лету пересоздаёт буфер и даёт рывок.
const pixelRatio = Math.min(window.devicePixelRatio, config.render.maxPixelRatio);
renderer.setPixelRatio(pixelRatio);
renderer.setClearColor(0x000000);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
camera.matrixAutoUpdate = true;

const stats = await loadStats();
const splat = createSplat(scene, renderer);
await createBackdrop(scene, stats);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  applyWindow(stats, w / h);
}
window.addEventListener("resize", resize);
resize();

const tracker = new HeadTracker();
void tracker.start();

let strengthX = config.tracking.strengthX;
let strengthY = config.tracking.strengthY;
window.addEventListener("keydown", (e) => {
  const k = config.tracking.strengthStep;
  if (e.key === "]") (strengthX *= k), (strengthY *= k);
  if (e.key === "[") (strengthX /= k), (strengthY /= k);
});

/** Линейно до knee × предела, дальше экспоненциально к пределу: без рывка на упоре. */
function softLimit(v: number, max: number) {
  const knee = max * config.view.softLimitKnee;
  const a = Math.abs(v);
  if (a <= knee) return v;
  const rest = max - knee;
  return Math.sign(v) * (knee + rest * (1 - Math.exp(-(a - knee) / rest)));
}

const eye = new THREE.Vector3(0, 0, D);
const mid = new THREE.Vector3(0, 0, D);
const target = new THREE.Vector3(0, 0, D);

// Статистика: FPS, JS-время, рывки (> 25 мс) и самый длинный интервал за секунду.
const perf = { frames: 0, jsMs: 0, long: 0, worst: 0, windowStart: 0, text: "" };

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(100, now - last);
  last = now;
  const t0 = performance.now();

  tracker.update(now, dt);
  target.set(
    softLimit(tracker.n.x * strengthX * 10 * (view.width / 2), view.maxEyeX),
    softLimit(tracker.n.y * strengthY * 10 * (view.height / 2), view.maxEyeY),
    D
  );
  // Два последовательных экспоненциальных сглаживания: трекер даёт 30 поз/с, экран 60.
  const a = 1 - Math.exp(-dt / config.tracking.smoothMs);
  mid.lerp(target, a);
  eye.lerp(mid, a);

  applyProjection(camera, eye);
  renderer.render(scene, camera);

  if (config.debugStats) {
    perf.frames++;
    perf.jsMs += performance.now() - t0;
    if (dt > 25) perf.long++;
    perf.worst = Math.max(perf.worst, dt);
    if (now - perf.windowStart >= 1000) {
      const s = tracker.stats;
      const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
      statsEl.textContent =
        `${perf.frames} fps · js ${(perf.jsMs / Math.max(1, perf.frames)).toFixed(1)} ms · ` +
        `>25ms ${perf.long}/s · worst ${perf.worst.toFixed(0)} ms · ${buf.x}×${buf.y} @${pixelRatio.toFixed(2)} · ` +
        `${s.mode} (${s.backend} ${s.detectMs.toFixed(0)} ms) · face ${s.rawX.toFixed(2)},${s.rawY.toFixed(2)} · ` +
        `strength ${strengthX.toFixed(3)}/${strengthY.toFixed(3)}` +
        (s.error ? ` · ${s.error}` : "");
      Object.assign(perf, { frames: 0, jsMs: 0, long: 0, worst: 0, windowStart: now });
    }
  }
  requestAnimationFrame(frame);
}

statsEl.hidden = !config.debugStats;
await splat.initialized;
requestAnimationFrame((t) => {
  last = t;
  frame(t);
  loading.classList.add("done");
});
