export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function sendError(res: any, err: unknown) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: true, code: err.code, message: err.message });
    return;
  }
  res.status(500).json({ error: true, code: "INTERNAL", message: "Internal server error" });
}

