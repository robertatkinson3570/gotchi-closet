import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { ReactNode } from "react";

interface MobileTabsProps {
  edit: ReactNode;
  wearables: ReactNode;
}

export function MobileTabs({ edit, wearables }: MobileTabsProps) {
  return (
    <div className="lg:hidden flex flex-col flex-1">
      <Tabs defaultValue="wearables" className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none border-b">
          <TabsTrigger value="wearables" className="flex-1">
            Wearables
          </TabsTrigger>
          <TabsTrigger value="edit" className="flex-1">
            Equipped
          </TabsTrigger>
        </TabsList>
        <TabsContent value="wearables" className="flex-1 overflow-auto p-4 mt-0">
          {wearables}
        </TabsContent>
        <TabsContent value="edit" className="flex-1 overflow-auto p-4 mt-0">
          {edit}
        </TabsContent>
      </Tabs>
    </div>
  );
}

