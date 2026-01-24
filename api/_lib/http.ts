export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function badRequest(code: string, message: string) {
  return new HttpError(400, code, message);
}

export function serverError(code: string, message: string) {
  return new HttpError(500, code, message);
}

export function upstreamError(message: string) {
  return new HttpError(502, "UPSTREAM_FAILED", message);
}

export function sendJson(res: any, status: number, body: any) {
  res.status(status).json(body);
}

export function sendOk(res: any, body: any) {
  res.status(200).json(body);
}

export function sendError(res: any, err: unknown, requestId: string) {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: true,
      code: err.code,
      message: err.message,
      requestId,
    });
    return;
  }
  res.status(500).json({
    error: true,
    code: "INTERNAL",
    message: "Internal server error",
    requestId,
  });
}

