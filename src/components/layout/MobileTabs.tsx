import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { ReactNode } from "react";

interface MobileTabsProps {
  edit: ReactNode;
  wearables: ReactNode;
}

export function MobileTabs({ edit, wearables }: MobileTabsProps) {
  return (
    <Tabs defaultValue="edit" className="flex-1 flex flex-col min-h-0">
      <TabsList className="w-full rounded-none border-b shrink-0">
        <TabsTrigger value="edit" className="flex-1">
          Gotchi
        </TabsTrigger>
        <TabsTrigger value="wearables" className="flex-1">
          Add Wearables
        </TabsTrigger>
      </TabsList>
      <TabsContent value="edit" className="flex-1 overflow-auto p-2 mt-0 data-[state=inactive]:hidden">
        {edit}
      </TabsContent>
      <TabsContent value="wearables" className="flex-1 overflow-auto p-2 mt-0 data-[state=inactive]:hidden">
        {wearables}
      </TabsContent>
    </Tabs>
  );
}

