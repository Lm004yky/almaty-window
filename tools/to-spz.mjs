// PLY → SPZ (в ~10 раз меньше). node tools/to-spz.mjs public/assets/<id>/scene.ply
import { readFileSync, writeFileSync } from "node:fs";
import { transcodeSpz } from "@sparkjsdev/spark";
for (const path of process.argv.slice(2)) {
  const { fileBytes } = await transcodeSpz({ inputs: [{ fileBytes: readFileSync(path), pathOrUrl: path }], maxSh: 0 });
  writeFileSync(path.replace(/\.ply$/, ".spz"), fileBytes);
  console.log(path, "→", fileBytes.length);
}
