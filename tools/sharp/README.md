# SHARP (Apple) локально: фото → Gaussian Splat

Окружение в `.venv/` (~1 ГБ), веса в `~/.cache/torch/hub/checkpoints/sharp_2572gikvuh.pt` (2,6 ГБ).

```bash
cd tools/sharp
PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.7 PYTORCH_MPS_LOW_WATERMARK_RATIO=0.5 \
  .venv/bin/sharp predict -i in/photo.jpg -o out --device mps
rm -f out/sharp_2572gikvuh.pt     # SHARP кладёт копию весов в выходную папку, она не нужна
node ../splat-stats.mjs out/photo.ply ../../public/assets/scene.ply.json
cp out/photo.ply ../../public/assets/scene.ply
```

Счёт занимает ~13 секунд на GPU Мака, результат 1,18 млн гауссиан, .ply около 66 МБ.

Важно про фокус: SHARP читает FocalLengthIn35mmFilm из EXIF, а без него берёт 30 мм.
Для сгенерированных картинок EXIF нет, поэтому фокус нужно вписать самому (оценку даёт
Depth Pro: `35mm = f_px / width_px * 36`). Пример записи тега в Exif IFD есть в истории
проекта: `exif.get_ifd(0x8769)[0xA405] = 18`. С неверным фокусом геометрия вытягивается.

Сцена в проекте: `config.scene.mode = "splat"`, файлы `public/assets/scene.ply` и
`scene.ply.json` (из него берётся угол обзора исходной камеры, чтобы окно в покое совпадало
с фото). Если файлов нет, сцена сама переходит на режим картинка + глубина.
