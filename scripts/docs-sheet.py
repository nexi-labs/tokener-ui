"""Contact sheet of docs screenshots for a quick look: python3 scripts/docs-sheet.py prefix-or-names... -> /tmp/docs_sheet.png (3 columns, labelled)."""
import os, sys
from PIL import Image, ImageDraw
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "docs", "shots")
names = sorted(f[:-5] for f in os.listdir(D) if f.endswith(".webp") and any(f.startswith(a) or f[:-5] == a for a in sys.argv[1:]))
W = 700; cols = 3; items = []
for n in names:
    im = Image.open(os.path.join(D, n + ".webp")).convert("RGB"); h = int(im.height * W / im.width); items.append((n, im.resize((W, h))))
rows = [items[i:i + cols] for i in range(0, len(items), cols)]
H = sum(max(i[1].height for i in r) + 24 for r in rows)
sheet = Image.new("RGB", (cols * (W + 10), H), "white"); y = 0; d = ImageDraw.Draw(sheet)
for r in rows:
    for c, (n, im) in enumerate(r):
        d.text((c * (W + 10) + 4, y + 4), n, fill="black"); sheet.paste(im, (c * (W + 10), y + 20))
    y += max(i[1].height for i in r) + 24
sheet.save("/tmp/docs_sheet.png"); print(len(items), "shots")
