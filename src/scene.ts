import * as THREE from "three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { config, current } from "./config";

export type SplatStats = {
  count: number;
  tanHalfX: number;
  tanHalfY: number;
  z: { p01: number; median: number; p99: number };
};

/** Размер окна (плоскость z = 0) и предел хода глаза; пересчитывается на resize. */
export const view = { width: 1, height: 1, maxEyeX: 0.1, maxEyeY: 0.1 };

export async function loadStats(): Promise<SplatStats> {
  const r = await fetch(current.base + "scene.ply.json");
  // Vite отдаёт index.html с 200 на несуществующий файл: проверяем тип, не статус.
  if (!(r.headers.get("content-type") ?? "").includes("json")) throw new Error("scene.ply.json not found");
  return r.json();
}

export function createSplat(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const D = config.view.windowDistance;
  // Без SparkRenderer в сцене SplatMesh загрузится, но экран останется чёрным.
  scene.add(
    new SparkRenderer({
      renderer,
      maxStdDev: config.render.maxStdDev,
      minSortIntervalMs: config.render.minSortIntervalMs,
      enableLod: false
    })
  );
  const mesh = new SplatMesh({ url: current.base + "scene.ply", lod: false });
  // OpenCV → three.js; камера исходного фото совпадает с точкой покоя глаза.
  mesh.rotation.x = Math.PI;
  mesh.position.set(0, 0, D);
  // Масштаб вокруг глаза: картинка в покое та же, а сцена ближе к окну.
  mesh.scale.setScalar(current.scale);
  scene.add(mesh);
  return mesh;
}

/** Размытая копия фото за облаком: в щелях за предметами виден её цвет, а не чёрный. */
export async function createBackdrop(scene: THREE.Scene, stats: SplatStats) {
  const { backdropDepthFactor, backdropCover, backdropBlurPx } = config.scene;
  const image = await new THREE.ImageLoader().loadAsync(current.base + "photo.jpg");
  const small = document.createElement("canvas");
  small.width = backdropBlurPx;
  small.height = Math.max(4, Math.round((backdropBlurPx * image.height) / image.width));
  small.getContext("2d")!.drawImage(image, 0, 0, small.width, small.height);
  const big = document.createElement("canvas");
  big.width = 512;
  big.height = Math.round((512 * small.height) / small.width);
  const ctx = big.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, 0, 0, big.width, big.height);

  const texture = new THREE.CanvasTexture(big);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;

  const T = stats.z.p99 * current.scale * backdropDepthFactor;
  const geometry = new THREE.PlaneGeometry(
    2 * stats.tanHalfX * T * backdropCover,
    2 * stats.tanHalfY * T * backdropCover
  );
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) - 0.5) * backdropCover + 0.5, (uv.getY(i) - 0.5) * backdropCover + 0.5);
  }
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ map: texture, depthTest: false, depthWrite: false })
  );
  mesh.position.set(0, 0, config.view.windowDistance - T);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  scene.add(mesh);
}

/** Ширина окна из угла обзора исходной камеры; угол от scale не зависит. */
export function applyWindow(stats: SplatStats, aspect: number) {
  const D = config.view.windowDistance;
  const { overscan } = config.scene;
  const { edgeTolerance } = current;
  const halfW = Math.min(stats.tanHalfX, stats.tanHalfY * aspect) * D;
  const halfH = halfW / aspect;
  view.width = (2 * halfW) / overscan;
  view.height = view.width / aspect;
  view.maxEyeX = halfW * (1 - 1 / overscan) * edgeTolerance;
  view.maxEyeY = halfH * (1 - 1 / overscan) * edgeTolerance;
}

/** Off-axis проекция (Kooima): несимметричный frustum через углы окна. */
export function applyProjection(camera: THREE.PerspectiveCamera, eye: THREE.Vector3) {
  const { near, far } = config.view;
  const k = near / eye.z;
  const left = (-view.width / 2 - eye.x) * k;
  const right = (view.width / 2 - eye.x) * k;
  const bottom = (-view.height / 2 - eye.y) * k;
  const top = (view.height / 2 - eye.y) * k;
  camera.position.copy(eye);
  camera.quaternion.identity();
  camera.projectionMatrix.makePerspective(left, right, top, bottom, near, far);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.updateMatrixWorld(true);
}
