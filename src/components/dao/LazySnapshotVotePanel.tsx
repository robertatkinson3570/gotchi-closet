import { lazy, Suspense } from "react";

const SnapshotVotePanel = lazy(() =>
  import("./SnapshotVotePanel").then((m) => ({ default: m.SnapshotVotePanel })),
);

export default function LazySnapshotVotePanel(
  props: React.ComponentProps<typeof SnapshotVotePanel>,
) {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading voting…</div>}>
      <SnapshotVotePanel {...props} />
    </Suspense>
  );
}
