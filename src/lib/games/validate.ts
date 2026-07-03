// src/lib/games/validate.ts
import { isCategory } from "./types";

export interface SubmissionInput {
  title: string;
  description: string;
  url: string;
  category: string;
  imageBase64: string;
  imageMime: string;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

const MAX_IMAGE_BYTES = 300 * 1024;
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Decoded byte length of a base64 string without allocating a Buffer. */
function base64Bytes(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((len * 3) / 4) - pad;
}

export function validateSubmission(input: SubmissionInput): ValidationResult {
  const title = (input.title ?? "").trim();
  if (title.length < 1 || title.length > 80) return { ok: false, error: "title must be 1–80 chars" };

  const description = (input.description ?? "").trim();
  if (description.length < 1 || description.length > 280) return { ok: false, error: "description must be 1–280 chars" };

  if (!isCategory(input.category)) return { ok: false, error: "invalid category" };

  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    return { ok: false, error: "invalid url" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return { ok: false, error: "url must be http(s)" };

  if (!IMAGE_MIMES.has(input.imageMime)) return { ok: false, error: "image must be png, jpeg, or webp" };
  if (!input.imageBase64) return { ok: false, error: "image required" };
  if (base64Bytes(input.imageBase64) > MAX_IMAGE_BYTES) return { ok: false, error: "image too large (max 300 KB)" };

  return { ok: true };
}
