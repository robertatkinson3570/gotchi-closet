import { useCompanion } from "@/state/useCompanion";
import { CompanionMascot } from "./CompanionMascot";
import { CompanionChatPanel } from "./CompanionChatPanel";
import { RoastArenaModal } from "@/components/roast/RoastArenaModal";

export function CompanionRoot() {
  const isOpen = useCompanion((s) => s.isOpen);
  return (
    <>
      <CompanionMascot />
      {isOpen && <CompanionChatPanel />}
      <RoastArenaModal />
    </>
  );
}
