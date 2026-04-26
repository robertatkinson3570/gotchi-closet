import { useCallback, useEffect, useState } from "react";
import { env } from "@/lib/env";

export type AutoRenewTemplate = {
  token_id: number;
  owner: string;
  initial_cost_wei: string;
  period_seconds: number;
  split_owner: number;
  split_borrower: number;
  split_other: number;
  third_party: string;
  whitelist_id: number;
  channelling: number;
  enabled: number;
  last_relist_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
};

type State = {
  templates: AutoRenewTemplate[];
  loading: boolean;
  error: string | null;
};

const initial: State = { templates: [], loading: false, error: null };

export function useAutoRenewTemplates(owner: string | null | undefined) {
  const [state, setState] = useState<State>(initial);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!owner || !env.autoRenewApiUrl) {
      setState(initial);
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch(`${env.autoRenewApiUrl}/listings/${owner.toLowerCase()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as AutoRenewTemplate[];
        if (cancelled) return;
        setState({
          templates: Array.isArray(data) ? data : [],
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          templates: [],
          loading: false,
          error: err?.message || "Failed to load auto-renew templates",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [owner, reloadKey]);

  return { ...state, reload };
}

export async function setTemplateEnabled(
  tokenId: number,
  enabled: boolean
): Promise<void> {
  if (!env.autoRenewApiUrl) throw new Error("Auto-renew API not configured");
  const res = await fetch(`${env.autoRenewApiUrl}/listings/${tokenId}/enable`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
