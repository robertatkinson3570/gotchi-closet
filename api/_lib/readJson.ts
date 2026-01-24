import { HttpError } from "./http";

const MAX_BYTES = 1_000_000;

export async function readJson<T>(req: any): Promise<T> {
  if (req?.body && typeof req.body === "object") {
    return req.body as T;
  }

  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = "";

    req.on("data", (chunk: Buffer | string) => {
      const str = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      size += Buffer.byteLength(str);
      if (size > MAX_BYTES) {
        req.destroy();
        reject(new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body too large"));
        return;
      }
      raw += str;
    });

    req.on("end", () => {
      if (!raw) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(raw) as T);
      } catch {
        reject(new HttpError(400, "BAD_JSON", "Invalid JSON body"));
      }
    });

    req.on("error", () => {
      reject(new HttpError(400, "READ_ERROR", "Failed to read request body"));
    });
  });
}

