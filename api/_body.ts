type JsonResponse = {
  error: true;
  message: string;
  code: string;
};

function toJsonError(message: string, code: string): JsonResponse {
  return { error: true, message, code };
}

export async function readJsonBody(
  req: any,
  res: any,
  options?: { maxBytes?: number }
): Promise<any | null> {
  const maxBytes = options?.maxBytes ?? 1_000_000;
  if (req?.body && typeof req.body === "object") {
    return req.body;
  }

  return new Promise((resolve) => {
    let size = 0;
    let raw = "";

    req.on("data", (chunk: Buffer | string) => {
      const str = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      size += Buffer.byteLength(str);
      if (size > maxBytes) {
        res
          .status(413)
          .json(toJsonError("Request body too large", "payload_too_large"));
        req.destroy();
        resolve(null);
        return;
      }
      raw += str;
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        res
          .status(400)
          .json(toJsonError("Invalid JSON body", "invalid_json"));
        resolve(null);
      }
    });

    req.on("error", () => {
      res
        .status(400)
        .json(toJsonError("Failed to read request body", "read_error"));
      resolve(null);
    });
  });
}

