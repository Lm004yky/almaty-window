# Depth Pro (Apple) локально

Окружение и веса (~2,5 ГБ) лежат здесь: `.venv/`, `checkpoints/depth_pro.pt`.
Если нужно освободить место, эту папку можно удалить целиком, сцена от неё не зависит.

```bash
cd tools/depthpro
PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.7 PYTORCH_MPS_LOW_WATERMARK_RATIO=0.5 \
  .venv/bin/python run_depth_pro.py ../../public/assets/room.jpg out/depthpro_room.png
```

Результат: 16-bit PNG, disparity = 1 / глубина_в_метрах × 20000, больше = ближе.
Считается на GPU Мака в половинной точности, около 8 секунд на картинку.
Для карты фона дальше нужен `tools/align-bg-depth.mjs` (см. корневой README).
