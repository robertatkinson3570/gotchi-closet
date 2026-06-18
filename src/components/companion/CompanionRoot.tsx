import { useCompanion } from "@/state/useCompanion";
import { useCompanionGotchis } from "./useCompanionGotchis";
import { CompanionMascot } from "./CompanionMascot";
import { CompanionChatPanel } from "./CompanionChatPanel";
import { RoastArenaModal } from "@/components/roast/RoastArenaModal";

export function CompanionRoot() {
  const isOpen = useCompanion((s) => s.isOpen);
  const gotchis = useCompanionGotchis();
  const selectedTokenId = useCompanion((s) => s.selectedTokenId);
  const g = gotchis.find((x) => x.id === selectedTokenId);
  return (
    <>
      <CompanionMascot />
      {isOpen && <CompanionChatPanel />}
      {!isOpen && g && (
        <div className="fixed bottom-20 right-4 z-40 max-w-[12rem] rounded-2xl bg-[#160a23]/85 px-3 py-1.5 text-xs text-white/85 shadow-lg backdrop-blur">
          psst… pet me to grow our kinship 👻
        </div>
      )}
      <RoastArenaModal />
    </>
  );
}
