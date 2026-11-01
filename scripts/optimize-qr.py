"""把公众号二维码缩到显示所需的最小尺寸。

原图 1280x1280 / 147KB，页面里只显示 112x112，冗余 5.7 倍。
按 2 倍图（224x224）保留高分屏清晰度，体积能降到十几 KB——
二维码是纯黑白方块，用 PNG 反而比 JPEG 更小且无压缩噪声。

用法：python scripts/optimize-qr.py
"""
from pathlib import Path

from PIL import Image

TARGET = 224  # 2x the 112px display size
SRC_CANDIDATES = ["wechat-qr.jpg", "wechat-qr.jpeg", "wechat-qr.png", "wechat-qr.webp"]

public = Path(__file__).resolve().parent.parent / "public"
src = next((public / n for n in SRC_CANDIDATES if (public / n).exists()), None)
if src is None:
    raise SystemExit("public/ 下找不到 wechat-qr.*")

img = Image.open(src).convert("RGBA")
print(f"原图 {src.name}: {img.size[0]}x{img.size[1]}  {src.stat().st_size / 1024:.1f} KB")

# 二维码是纯黑白，等比缩放到 2x 目标尺寸即够；LANCZOS 对硬边块状图最稳
img = img.resize((TARGET, TARGET), Image.LANCZOS)

out = public / "wechat-qr.png"
img.save(out, "PNG", optimize=True)
print(f"输出 {out.name}: {img.size[0]}x{img.size[1]}  {out.stat().st_size / 1024:.1f} KB")
print(f"节省 {(1 - out.stat().st_size / src.stat().st_size) * 100:.0f}%")

if src.suffix.lower() != ".png":
    src.unlink()
    print(f"已删除原图 {src.name}（避免两份图同时进 public/）")
