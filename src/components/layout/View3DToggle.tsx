import { Button } from "@/ui/button";
import { Box } from "lucide-react";
import { useView3D } from "@/app/View3DProvider";

/** Site-wide 3D/2D switch: gotchi renders swap to rotating 3D models where a
 *  model exists (everything else stays pixel art). Sits next to the theme
 *  toggle in the nav. */
export function View3DToggle() {
  const { enabled, toggle } = useView3D();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={enabled ? "3D mode on: gotchis render as 3D models where available" : "Switch to 3D gotchi rendering"}
      aria-label="Toggle 3D rendering"
      aria-pressed={enabled}
      className={enabled ? "text-primary bg-primary/10 hover:bg-primary/20" : undefined}
    >
      <Box className="h-5 w-5" />
    </Button>
  );
}
