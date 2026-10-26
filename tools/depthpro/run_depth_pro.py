"""Depth Pro (Apple) -> 16-bit disparity PNG.

    .venv/bin/python run_depth_pro.py <image.jpg> <out.png> [--scale 20000]

Пишет disparity = 1 / depth_m * scale как 16-bit PNG (0..65535), больше = ближе.
Одинаковый scale для нескольких картинок одной сцены даёт общую шкалу.
"""
import sys, time, argparse
import numpy as np
import torch
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument("image")
ap.add_argument("out")
ap.add_argument("--scale", type=float, default=20000.0)
ap.add_argument("--precision", choices=["fp16", "fp32"], default="fp16")
ap.add_argument("--cpu", action="store_true")
args = ap.parse_args()

import depth_pro

if not args.cpu and torch.backends.mps.is_available():
    device = torch.device("mps")
elif not args.cpu and torch.cuda.is_available():
    device = torch.device("cuda")
else:
    device = torch.device("cpu")
precision = torch.float16 if (args.precision == "fp16" and device.type != "cpu") else torch.float32
print("device:", device, "precision:", precision, flush=True)

t0 = time.time()
model, transform = depth_pro.create_model_and_transforms(device=device, precision=precision)
model.eval()
print(f"model loaded in {time.time() - t0:.1f}s", flush=True)

image, _, f_px = depth_pro.load_rgb(args.image)
x = transform(image)
t0 = time.time()
with torch.no_grad():
    pred = model.infer(x, f_px=f_px)
depth = pred["depth"].detach().cpu().numpy().astype(np.float64)  # метры
print(f"inference {time.time() - t0:.1f}s, focal px: {float(pred['focallength_px']):.1f}")
print(f"depth m: min {depth.min():.3f} max {depth.max():.3f} median {np.median(depth):.3f}")

disp = 1.0 / np.clip(depth, 1e-3, None) * args.scale
clipped = float((disp > 65535).mean() * 100)
disp16 = np.clip(np.round(disp), 0, 65535).astype(np.uint16)
print(f"disparity raw: min {disp.min():.0f} max {disp.max():.0f}, clipped>65535: {clipped:.2f}%")
Image.fromarray(disp16).save(args.out)
print("wrote", args.out, disp16.shape[::-1])
