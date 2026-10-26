// Все настройки страницы в одном месте.

export const config = {
  /** Строка статистики в левом нижнем углу (FPS, трекер, детект). */
  debugStats: false,

  /** Сцена по умолчанию; другую можно открыть через ?scene=bazaar. */
  defaultScene: "balcony" as SceneId,

  /** Сцены: файлы в public/assets/<id>/ (scene.ply, scene.ply.json, photo.jpg). */
  scenes: {
    balcony: {
      /** Масштаб облака вокруг точки глаза. Меньше = сцена ближе к окну, больше объёма.
       *  Держать p01 × scale чуть дальше windowDistance (p01 = 1.17 м). */
      scale: 0.68,
      /** Множитель теоретического предела хода глаза: 2 при далёком фоне у краёв. */
      edgeTolerance: 2,
      title: "Almaty",
      copy: "A balcony on the fourth floor, six in the morning. The mountains are where they always are, the poplars are not going anywhere either. Move your head a little and the screen becomes a window: the frame stays put, the city slides behind it."
    },
    bazaar: {
      /** p01 = 1.18 м. */
      scale: 0.68,
      edgeTolerance: 4,
      title: "Almaty",
      copy: "The Green Bazaar an hour before opening. Nobody is selling, nobody is bargaining, the apples are just lying there. Move your head and the screen becomes a window: the stalls stay close, the hall stretches away."
    },
    school: {
      /** p01 = 2.23 м. */
      scale: 0.36,
      edgeTolerance: 4,
      title: "School",
      copy: "An empty corridor after the last bell. Nothing happens here: no lessons, no footsteps, the janitor went home an hour ago. Move your head a little and the screen becomes a window."
    }
  },

  scene: {
    /** Окно уже кадра в overscan раз: запас кадра на движение головы. */
    overscan: 1.12,
    /** Подложка: глубина = p99 × scale × depthFactor. */
    backdropDepthFactor: 1.15,
    /** Подложка шире кадра в столько раз (UV за 0..1 тянут крайние пиксели). */
    backdropCover: 2.4,
    /** Ширина уменьшенной копии фото для размытия, px. */
    backdropBlurPx: 48
  },

  view: {
    /** Расстояние от глаза до окна в покое, м. */
    windowDistance: 0.72,
    near: 0.01,
    /** Дальше подложки самой глубокой сцены (балкон: 100 × 0.68 × 1.15 ≈ 78 м). */
    far: 200,
    /** До этой доли предела ход линейный, дальше экспоненциально к пределу. */
    softLimitKnee: 0.6
  },

  render: {
    /** Потолок pixelRatio: 1.25 чётко, 0.55 мягко и быстрее всего. На лету не менять. */
    maxPixelRatio: 1.25,
    /** Обрезка гауссиан по сигмам (√5 как у Spark по умолчанию для SHARP). */
    maxStdDev: Math.sqrt(5),
    /** Сортировка облака один раз при загрузке; частая сортировка стопорит кадр. */
    minSortIntervalMs: 1e9
  },

  tracking: {
    /** Классический воркер с BlazeFace на tfjs-wasm. */
    workerUrl: "/faceWorkerTf.js",
    /** Запрос к веб-камере. */
    videoWidth: 640,
    videoHeight: 360,
    /** Ширина кадра, отправляемого в детектор, px. */
    detectWidth: 320,
    /** Не чаще стольких детектов в секунду. */
    maxDetectFps: 30,
    /** Вебкамера не зеркалит кадр, поэтому для камеры x инвертируется. */
    invertXCamera: false,
    /** Инверсия вертикали для камеры. */
    invertYCamera: true,
    /** Для мыши инверсия не нужна. */
    invertXMouse: false,
    /** Сила смещения глаза: eye.x = n.x × strengthX × 10 × (W/2). Клавиши ] и [. */
    strengthX: 0.13,
    strengthY: 0.08,
    /** Шаг изменения strength клавишами (множитель). */
    strengthStep: 1.1,
    /** One Euro фильтр на нормализованном положении лица. */
    minCutoff: 0.45,
    beta: 3,
    dCutoff: 1,
    /** Мёртвая зона с люфтом после фильтра, в долях полукадра. */
    deadZone: 0.004,
    /** Две последовательные экспоненты догоняния цели на каждом кадре рендера, мс. */
    smoothMs: 55,
    /** Держать последнюю позу, если лицо пропало, мс. */
    holdMs: 1500,
    /** Переход на мышь после удержания, мс. */
    toMouseMs: 900,
    /** Переход обратно на камеру, когда лицо вернулось, мс. */
    toCameraMs: 400
  }
};

export type SceneId = "balcony" | "bazaar" | "school";
export type SceneConfig = (typeof config.scenes)[SceneId];

/** Выбранная сцена: ?scene=<id> или defaultScene. */
export const sceneId: SceneId = ((id) => (id && id in config.scenes ? id : config.defaultScene))(
  new URLSearchParams(location.search).get("scene") as SceneId | null
);
export const current = { id: sceneId, ...config.scenes[sceneId], base: `/assets/${sceneId}/` };
