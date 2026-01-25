export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response | null> {
  const { timeoutMs = 8000, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(input, {
      ...rest,
      signal: rest.signal ?? controller.signal,
    });
    return res;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      return null;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

