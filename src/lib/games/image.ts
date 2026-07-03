// src/lib/games/image.ts
// Downscale a picked file to a small webp/jpeg so it fits the 300 KB store cap and the
// JSON body limit. Returns base64 (no data: prefix) + the chosen mime.
const MAX_EDGE = 512;

export interface DownscaledImage { base64: string; mime: string }

export async function downscaleImageFile(file: File): Promise<DownscaledImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unsupported");
  ctx.drawImage(bitmap, 0, 0, w, h);

  const mime = "image/webp";
  const dataUrl = canvas.toDataURL(mime, 0.85);
  return { base64: dataUrl.split(",")[1] ?? "", mime };
}
