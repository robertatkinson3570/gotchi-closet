import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { ReactNode } from "react";

interface MobileTabsProps {
  edit: ReactNode;
  wearables: ReactNode;
}

export function MobileTabs({ edit, wearables }: MobileTabsProps) {
  return (
    <div className="lg:hidden h-[calc(100vh-73px)] flex flex-col">
      <Tabs defaultValue="edit" className="flex-1 flex flex-col">
        <TabsList className="w-full rounded-none">
          <TabsTrigger value="edit" className="flex-1">
            Edit
          </TabsTrigger>
          <TabsTrigger value="wearables" className="flex-1">
            Wearables
          </TabsTrigger>
        </TabsList>
        <TabsContent value="edit" className="flex-1 overflow-auto p-4 mt-0">
          {edit}
        </TabsContent>
        <TabsContent value="wearables" className="flex-1 overflow-auto p-4 mt-0">
          {wearables}
        </TabsContent>
      </Tabs>
    </div>
  );
}

