import { createApp } from "./app";
import { startPrewarm } from "./gotchi3d/prewarm";

// Load a local .env for development if present. No-op when the file is missing
// or on older Node without loadEnvFile. Production sets real env vars directly.
// Companion API keys (GROQ_API_KEY, etc.) are read per-request, so loading here
// (before listen) is sufficient.
try {
  (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.();
} catch {
  /* .env is optional */
}

const port = Number(process.env.PORT) || 8787;
const app = createApp();

app.listen(port, () => {
  console.log(`API server listening on ${port}`);
  startPrewarm();
});

