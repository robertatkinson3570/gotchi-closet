import ReactDOM from "react-dom/client";
import App from "./app/App";
import "./styles/globals.css";

// After a redeploy, a client still on the old index.html 404s on stale chunk
// hashes ("Failed to fetch dynamically imported module"). Reload once (guarded)
// to fetch the fresh index; clear the guard on a clean load so future deploys
// can retry again. Mirrors the per-import guard in lib/lazyWithRetry.
const CHUNK_RELOAD_KEY = "gc-chunk-reload";
window.addEventListener("vite:preloadError", (e) => {
  e.preventDefault();
  if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return;
  sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  window.location.reload();
});
window.addEventListener("load", () => sessionStorage.removeItem(CHUNK_RELOAD_KEY));

// index.html ships static SEO tags + a crawler-visible content shell for user
// agents that don't execute JS. Once the app boots, react-helmet-async owns the
// document head, so drop the static tags to avoid duplicate title/description/
// OG tags in the rendered DOM. Order matters: the shell node must go before the
// [data-static-seo] <style> that hides it — removing the style first makes the
// shell visible for the frames until React's first commit clears #root.
document.querySelector(".gc-static-shell")?.remove();
document.querySelectorAll("[data-static-seo]").forEach((el) => el.remove());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <App />
);

