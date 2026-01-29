import type { ExplorerGotchi } from "@/lib/explorer/types";
import { GotchiSvg } from "@/components/gotchi/GotchiSvg";
import { Store, Sparkles } from "lucide-react";

type Props = {
  gotchi: ExplorerGotchi;
  onClick: () => void;
  textOnly?: boolean;
};

export function FamilyPhotoItem({ gotchi, onClick, textOnly }: Props) {
  const hasListing = !!gotchi.listing;
  const hasSet = !!gotchi.equippedSetName;

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
        <div className="flex items-center gap-0.5 mt-0.5">
          {hasListing && <Store className="h-2.5 w-2.5 text-green-500" />}
          {hasSet && <Sparkles className="h-2.5 w-2.5 text-purple-400" />}
        </div>
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
      <div className="flex items-center gap-0.5 h-3">
        {hasListing && <Store className="h-2.5 w-2.5 text-green-500" />}
        {hasSet && <Sparkles className="h-2.5 w-2.5 text-purple-400" />}
      </div>
    </button>
  );
}
