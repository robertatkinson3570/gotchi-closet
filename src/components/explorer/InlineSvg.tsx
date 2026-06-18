import { useEffect, useRef } from "react";

/**
 * Renders raw SVG markup safely inside React-reconciled trees.
 *
 * `dangerouslySetInnerHTML` lets the browser parse arbitrary child nodes that
 * React does not track. When such a node is conditionally swapped with a
 * different element (e.g. a fallback icon) or unmounted during a fast view
 * switch, React's commit-deletion walk can reference a child the browser has
 * already normalised away — throwing
 *   NotFoundError: Failed to execute 'removeChild' on 'Node'
 * and tripping the route error boundary ("Something went wrong").
 *
 * The fix: React only ever sees a single, stable, empty <span>. The SVG markup
 * is written into it imperatively via a ref, so React never reconciles the raw
 * SVG children and unmounting the span can never desync. The element type is
 * always the same regardless of loading/empty state, so there is no swap.
 */
export function InlineSvg({
  svg,
  className,
  testId,
}: {
  svg: string | null | undefined;
  className?: string;
  testId?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Only mutate when the markup actually changes (avoids needless reparse).
    const next = svg ?? "";
    if (el.innerHTML !== next) el.innerHTML = next;
    // On unmount, clear the imperatively-managed children ourselves so the
    // browser — not React's reconciler — removes them.
    return () => {
      if (el) el.innerHTML = "";
    };
  }, [svg]);

  return <span ref={ref} className={className} data-testid={testId} />;
}
