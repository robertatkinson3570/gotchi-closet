import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";

type DebugStats = {
  cacheHits: number;
  cacheMisses: number;
  thumbHits: number;
  thumbMisses: number;
  lastRpcUrl: string;
  rpcHealth: Array<{
    url: string;
    failures: number;
    lastSuccess: number;
    cooldownUntil: number;
  }>;
};

export function DebugPanel() {
  const [stats, setStats] = useState<DebugStats | null>(null);

  useEffect(() => {
    let mounted = true;
    const fetchStats = () => {
      fetch("/api/debug")
        .then((res) => res.json())
        .then((json) => {
          if (mounted) setStats(json);
        })
        .catch(() => {
          // ignore
        });
    };
    fetchStats();
    const id = window.setInterval(fetchStats, 5000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  if (!stats) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">Debug Panel</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Loading debug stats...
        </CardContent>
      </Card>
    );
  }

  const totalSvg = stats.cacheHits + stats.cacheMisses;
  const totalThumbs = stats.thumbHits + stats.thumbMisses;
  const hitRate = totalSvg ? Math.round((stats.cacheHits / totalSvg) * 100) : 0;
  const thumbRate = totalThumbs
    ? Math.round((stats.thumbHits / totalThumbs) * 100)
    : 0;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-sm">Debug Panel</CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        <div>SVG cache hit rate: {hitRate}%</div>
        <div>Thumb cache hit rate: {thumbRate}%</div>
        <div>Last RPC: {stats.lastRpcUrl || "n/a"}</div>
        <div className="space-y-1">
          {stats.rpcHealth.map((rpc) => (
            <div key={rpc.url} className="flex justify-between">
              <span className="truncate max-w-[200px]">{rpc.url}</span>
              <span>
                fails:{rpc.failures} last:
                {rpc.lastSuccess ? "ok" : "never"}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

