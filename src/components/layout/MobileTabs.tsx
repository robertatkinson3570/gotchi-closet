import { ReactNode, useState } from "react";
import { Button } from "@/ui/button";
import { ArrowLeft, Plus } from "lucide-react";

interface MobileTabsProps {
  edit: ReactNode;
  wearables: ReactNode;
}

export function MobileTabs({ edit, wearables }: MobileTabsProps) {
  const [view, setView] = useState<"edit" | "wearables">("edit");

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="shrink-0 border-b bg-muted/30 px-2 py-1.5">
        {view === "edit" ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => setView("wearables")}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Wearables
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px]"
            onClick={() => setView("edit")}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Back to Gotchi
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-2">
        {view === "edit" ? edit : wearables}
      </div>
    </div>
  );
}

