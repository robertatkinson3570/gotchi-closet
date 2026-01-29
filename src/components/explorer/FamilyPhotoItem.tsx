import type { ExplorerGotchi } from "@/lib/explorer/types";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";

type Props = {
  gotchi: ExplorerGotchi;
  onClick: () => void;
  textOnly?: boolean;
};

export function FamilyPhotoItem({ gotchi, onClick, textOnly }: Props) {
  if (textOnly) {
    return (
      <button
        onClick={onClick}
        className="flex flex-col items-center p-1.5 rounded hover:bg-muted/50 transition-colors text-center min-w-0 group"
      >
        <span className="text-xs font-medium truncate w-full group-hover:text-primary transition-colors">
          {gotchi.name || `Gotchi #${gotchi.tokenId}`}
        </span>
        <span className="text-[10px] text-muted-foreground">#{gotchi.tokenId}</span>
        <span className="text-[10px] text-purple-500 font-medium">{gotchi.withSetsRarityScore}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center p-1 rounded hover:bg-muted/30 transition-colors text-center min-w-0 group"
    >
      <div className="w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 flex items-center justify-center">
        <GotchiSvg
          gotchiId={gotchi.tokenId}
          hauntId={gotchi.hauntId}
          equippedWearables={gotchi.equippedWearables}
          numericTraits={gotchi.numericTraits}
          collateral={gotchi.collateral}
          className="w-full h-full"
        />
      </div>
      <span className="text-[10px] sm:text-xs font-medium truncate w-full mt-0.5 group-hover:text-primary transition-colors leading-tight">
        {gotchi.name || `#${gotchi.tokenId}`}
      </span>
      <span className="text-[9px] sm:text-[10px] text-purple-500 font-medium leading-tight">
        {gotchi.withSetsRarityScore}
      </span>
    </button>
  );
}
