import { HttpError } from "./http.js";

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new HttpError(500, "MISSING_ENV", `Missing env var: ${name}`);
  }
  return value;
}

