// Классический воркер: BlazeFace на TensorFlow.js с WASM-бэкендом.
// Полностью на процессоре, без WebGL: не ждёт очередь видеокарты, которую
// занимает рендер облака (MediaPipe даже в CPU-режиме гоняет кадр через GL).
"use strict";
importScripts("/tfjs/tf-core.min.js", "/tfjs/tf-converter.min.js", "/tfjs/tf-backend-wasm.min.js", "/tfjs/blazeface.min.umd.js");

let model = null;
let busy = false;

self.onmessage = async (event) => {
  const msg = event.data;
  if (msg.type === "init") {
    await init();
    return;
  }
  if (msg.type !== "frame" || !model || busy) return;
  busy = true;
  const t0 = performance.now();
  try {
    const img = new ImageData(new Uint8ClampedArray(msg.pixels), msg.width, msg.height);
    // estimateFaces(input, returnTensors, flipHorizontal, annotateBoxes):
    // annotateBoxes=true нужен, иначе точек глаз в ответе нет.
    const faces = await model.estimateFaces(img, false, false, true);
    const f = faces[0];
    if (!f || !f.landmarks) {
      self.postMessage({ type: "lost", timeMs: msg.timeMs, detectMs: performance.now() - t0 });
    } else {
      // landmarks: [правый глаз, левый глаз, нос, рот, правое ухо, левое ухо] в пикселях кадра
      const [re, le] = f.landmarks;
      const lx = re[0] / msg.width, ly = re[1] / msg.height;
      const rx = le[0] / msg.width, ry = le[1] / msg.height;
      self.postMessage({
        type: "face",
        observation: {
          x: (lx + rx) / 2,
          y: (ly + ry) / 2,
          eyeSpan: Math.hypot(rx - lx, ry - ly),
          frameAspect: msg.height / Math.max(1, msg.width),
          timeMs: msg.timeMs
        },
        detectMs: performance.now() - t0
      });
    }
  } catch (error) {
    self.postMessage({ type: "error", message: "детект: " + (error && error.message ? error.message : String(error)) });
  } finally {
    busy = false;
  }
};

async function init() {
  try {
    tf.wasm.setWasmPaths("/tfjs/");
    await tf.setBackend("wasm");
    await tf.ready();
    model = await blazeface.load({
      maxFaces: 1,
      inputWidth: 128,
      inputHeight: 128,
      scoreThreshold: 0.5,
      modelUrl: "/tfjs/blazeface/model.json"
    });
    // Прогрев.
    const warm = new ImageData(new Uint8ClampedArray(128 * 128 * 4), 128, 128);
    await model.estimateFaces(warm, false, false, true);
    self.postMessage({ type: "ready", delegate: "WASM/blaze" });
  } catch (error) {
    self.postMessage({ type: "error", message: "модель: " + (error && error.message ? error.message : String(error)) });
  }
}
