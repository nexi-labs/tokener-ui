/**
 * Pixel measurements that decide how an image can be shrunk. They work on plain RGBA bytes and use only integer arithmetic, so the browser
 * and the Java gateway reach the same decision on the same pixels.
 */
export type Box = { x: number; y: number; w: number; h: number };

/**
 * The part of an image that is not a uniform border. The background is the colour of the top left pixel, and a row or column belongs to the
 * border when every pixel in it is within `tol` of that colour on every channel. Returns the whole image when the border is thin, because
 * cropping a sliver saves nothing, and never returns less than 8 pixels on a side.
 */
export function contentBox(rgba: ArrayLike<number>, w: number, h: number, tol = 8): Box {
  if (w < 1 || h < 1) return { x: 0, y: 0, w, h };
  const r0 = rgba[0], g0 = rgba[1], b0 = rgba[2], a0 = rgba[3];
  const same = (i: number) => Math.abs(rgba[i] - r0) <= tol && Math.abs(rgba[i + 1] - g0) <= tol && Math.abs(rgba[i + 2] - b0) <= tol && Math.abs(rgba[i + 3] - a0) <= tol;
  const rowBlank = (y: number) => { for (let x = 0; x < w; x++) if (!same((y * w + x) * 4)) return false; return true; };
  const colBlank = (x: number, y0: number, y1: number) => { for (let y = y0; y <= y1; y++) if (!same((y * w + x) * 4)) return false; return true; };
  let top = 0, bottom = h - 1;
  while (top < bottom && rowBlank(top)) top++;
  while (bottom > top && rowBlank(bottom)) bottom--;
  let left = 0, right = w - 1;
  while (left < right && colBlank(left, top, bottom)) left++;
  while (right > left && colBlank(right, top, bottom)) right--;
  const box = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  if (box.w < 8 || box.h < 8) return { x: 0, y: 0, w, h };
  // Less than 3% of the area is not worth a crop.
  return box.w * box.h * 100 >= w * h * 97 ? { x: 0, y: 0, w, h } : box;
}

export type Kind = "flat" | "photo";

/**
 * Whether an image is flat (a screenshot, a scanned page, a chart, a diagram) or a photograph. A flat image uses few colours, and shrinking it
 * hurts legibility far sooner than shrinking a photo. Colours are reduced to 4 bits per channel, and the image is flat when 16 or fewer such
 * colours cover at least 90% of the pixels. Large images are sampled on a regular grid so the cost stays bounded.
 */
export function classify(rgba: ArrayLike<number>, w: number, h: number): Kind {
  const total = w * h;
  if (total === 0) return "photo";
  const step = Math.max(1, Math.floor(Math.sqrt(total / 65536)));
  const counts = new Map<number, number>();
  let n = 0;
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
    const i = (y * w + x) * 4;
    const key = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1); n++;
  }
  const top = [...counts.values()].sort((a, b) => b - a).slice(0, 16).reduce((a, c) => a + c, 0);
  return top * 10 >= n * 9 ? "flat" : "photo";
}
