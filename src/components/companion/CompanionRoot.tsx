import { useCompanion } from "@/state/useCompanion";
import { CompanionMascot } from "./CompanionMascot";
import { CompanionChatPanel } from "./CompanionChatPanel";

export function CompanionRoot() {
  const isOpen = useCompanion((s) => s.isOpen);
  return (
    <>
      <CompanionMascot />
      {isOpen && <CompanionChatPanel />}
    </>
  );
}
