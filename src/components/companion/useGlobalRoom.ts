import { useEffect, useRef, useState } from "react";
import { getGlobalHistory, globalStreamUrl, type GlobalMessage } from "@/lib/companion/api";

// History-then-stream. Dedupes by id; the caller's own post returns via the stream.
export function useGlobalRoom(open: boolean) {
  const [messages, setMessages] = useState<GlobalMessage[]>([]);
  const seen = useRef<Set<number>>(new Set());

  function add(list: GlobalMessage[]) {
    setMessages((prev) => {
      const next = [...prev];
      for (const m of list) {
        if (seen.current.has(m.id)) continue;
        seen.current.add(m.id);
        next.push(m);
      }
      next.sort((a, b) => a.id - b.id);
      return next.slice(-200); // cap rendered history
    });
  }

  useEffect(() => {
    if (!open) return;
    let es: EventSource | null = null;
    let cancelled = false;
    getGlobalHistory(50).then((h) => { if (!cancelled) add(h); });
    es = new EventSource(globalStreamUrl());
    es.addEventListener("message", (e) => {
      try { add([JSON.parse((e as MessageEvent).data)]); } catch { /* ignore */ }
    });
    return () => { cancelled = true; es?.close(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return messages;
}
