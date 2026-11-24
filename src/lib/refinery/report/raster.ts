/** Browser-only helpers that turn SVG text into PNG bytes, so charts and the logo can go into Word and PDF files. */
export type Png = { data: Uint8Array; width: number; height: number; dataUrl: string };

export function withSize(svg: string, w: number, h: number): string {
  return svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, "")} width="${w}" height="${h}">`);
}

export async function svgToPng(svg: string, width: number, height: number, scale = 2): Promise<Png> {
  const url = URL.createObjectURL(new Blob([withSize(svg, width, height)], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image(); img.decoding = "sync";
    await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error("A chart could not be drawn.")); img.src = url; });
    const c = document.createElement("canvas"); c.width = Math.round(width * scale); c.height = Math.round(height * scale);
    const g = c.getContext("2d"); if (!g) throw new Error("This browser cannot draw the report charts.");
    g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/png"); const bin = atob(dataUrl.split(",")[1]); const data = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    return { data, width, height, dataUrl };
  } finally { URL.revokeObjectURL(url); }
}

/** The Tokener logo from the brand folder, as text. Dark ink on a light page. */
export async function loadLogoSvg(): Promise<string> {
  const r = await fetch("/brand/logo-light.svg"); if (!r.ok) throw new Error("The logo could not be loaded.");
  return r.text();
}
export const LOGO_RATIO = 593 / 186;
