export function logError(message: string, error?: unknown) {
  if (import.meta.env.DEV) {
    console.error(message, error);
    return;
  }
  console.error(`[GotchiCloset] ${message}`);
}

