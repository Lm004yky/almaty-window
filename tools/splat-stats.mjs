// Статистика по 3DGS .ply (SHARP): сколько гауссиан, границы, угол обзора.
//   node tools/splat-stats.mjs scene.ply scene.ply.json
// Координаты OpenCV: x вправо, y вниз, z вперёд, камера в начале координат.
import { readFileSync, writeFileSync } from "node:fs";
const [, , inPath, outPath] = process.argv;
const buf = readFileSync(inPath);
const headerEnd = buf.indexOf("end_header\n") + "end_header\n".length;
const header = buf.subarray(0, headerEnd).toString("ascii").split("\n");
// Элементы по порядку: у SHARP после vertex идут extrinsic, intrinsic, image_size и др.
const elements = [];
let format = "";
const sizes = { float: 4, float32: 4, double: 8, uchar: 1, uint8: 1, int: 4, uint: 4, short: 2, ushort: 2 };
for (const line of header) {
  const t = line.trim().split(/\s+/);
  if (t[0] === "format") format = t[1];
  if (t[0] === "element") elements.push({ name: t[1], count: Number(t[2]), props: [] });
  if (t[0] === "property") elements[elements.length - 1].props.push({ type: t[1], name: t[2] });
}
if (format !== "binary_little_endian") throw new Error("ожидается binary_little_endian, получено " + format);
const vertex = elements.find((e) => e.name === "vertex");
const count = vertex.count;
const props = vertex.props;
const stride = props.reduce((s, p) => s + sizes[p.type], 0);
const off = {}; let o = 0; for (const p of props) { off[p.name] = o; o += sizes[p.type]; }
const dv = new DataView(buf.buffer, buf.byteOffset + headerEnd, count * stride);

// Прочие элементы (intrinsic 3x3, image_size и т.д.) идут сразу после вершин.
const extras = {};
let pos = headerEnd + count * stride;
for (const e of elements) {
  if (e.name === "vertex") continue;
  const vals = [];
  for (let i = 0; i < e.count; i++) for (const p of e.props) {
    const sz = sizes[p.type];
    if (p.type === "float" || p.type === "float32") vals.push(buf.readFloatLE(pos));
    else if (p.type === "double") vals.push(buf.readDoubleLE(pos));
    else if (p.type === "uint") vals.push(buf.readUInt32LE(pos));
    else if (p.type === "int") vals.push(buf.readInt32LE(pos));
    else if (p.type === "uchar" || p.type === "uint8") vals.push(buf.readUInt8(pos));
    else vals.push(null);
    pos += sz;
  }
  extras[e.name] = vals;
}
const tx = [], ty = [], zs = [];
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
const step = Math.max(1, Math.floor(count / 400000));
for (let i = 0; i < count; i += step) {
  const b = i * stride;
  const x = dv.getFloat32(b + off.x, true), y = dv.getFloat32(b + off.y, true), z = dv.getFloat32(b + off.z, true);
  if (!Number.isFinite(x + y + z)) continue;
  if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  if (z > 0.05) { tx.push(Math.abs(x) / z); ty.push(Math.abs(y) / z); zs.push(z); }
}
const pct = (arr, p) => { const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))]; };
// Если в файле есть intrinsic (fx 0 cx; 0 fy cy; 0 0 1) и размер кадра, угол обзора берём из них.
let intrinsicFov = null;
if (extras.intrinsic && extras.intrinsic.length === 9 && extras.image_size && extras.image_size.length === 2) {
  const [fx, , cx, , fy, cy] = extras.intrinsic;
  const [w, h] = extras.image_size;
  intrinsicFov = { fx, fy, cx, cy, width: w, height: h, tanHalfX: (w / 2) / fx, tanHalfY: (h / 2) / fy };
}
const stats = {
  count, stride, properties: props.map((p) => p.name), extras, intrinsicFov,
  bounds: { x: [minX, maxX], y: [minY, maxY], z: [minZ, maxZ] },
  z: { p01: pct(zs, 0.01), median: pct(zs, 0.5), p99: pct(zs, 0.99) },
  // тангенсы половинных углов обзора по 99-му перцентилю (граница кадра)
  tanHalfX: intrinsicFov ? intrinsicFov.tanHalfX : pct(tx, 0.99),
  tanHalfY: intrinsicFov ? intrinsicFov.tanHalfY : pct(ty, 0.99),
  cloudTanHalfX: pct(tx, 0.99), cloudTanHalfY: pct(ty, 0.99)
};
stats.hfovDeg = 2 * Math.atan(stats.tanHalfX) * 180 / Math.PI;
stats.vfovDeg = 2 * Math.atan(stats.tanHalfY) * 180 / Math.PI;
console.log(JSON.stringify(stats, null, 2));
if (outPath) writeFileSync(outPath, JSON.stringify(stats));
