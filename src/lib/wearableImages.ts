import type { Wearable } from "@/types";

export type WearableCandidateFields = {
  image?: string;
  imageUrl?: string;
  icon?: string;
  iconUrl?: string;
  svg?: string;
  svgUrl?: string;
  thumbnail?: string;
  thumbnailUrl?: string;
  metadataImage?: string;
  metadataImageUrl?: string;
};

const CANONICAL_ICON_BASES = [
  "https://aavegotchi.com/images/items",
  "https://app.aavegotchi.com/images/items",
];

export function getWearableCandidateFields(
  wearable: Wearable
): WearableCandidateFields {
  const anyWearable = wearable as unknown as Record<string, unknown>;
  const metadata = anyWearable.metadata as Record<string, unknown> | undefined;
  return {
    image: typeof anyWearable.image === "string" ? (anyWearable.image as string) : undefined,
    imageUrl:
      typeof anyWearable.imageUrl === "string" ? (anyWearable.imageUrl as string) : undefined,
    icon: typeof anyWearable.icon === "string" ? (anyWearable.icon as string) : undefined,
    iconUrl: typeof anyWearable.iconUrl === "string" ? (anyWearable.iconUrl as string) : undefined,
    svg: typeof anyWearable.svg === "string" ? (anyWearable.svg as string) : undefined,
    svgUrl: typeof anyWearable.svgUrl === "string" ? (anyWearable.svgUrl as string) : undefined,
    thumbnail:
      typeof anyWearable.thumbnail === "string" ? (anyWearable.thumbnail as string) : undefined,
    thumbnailUrl:
      typeof anyWearable.thumbnailUrl === "string"
        ? (anyWearable.thumbnailUrl as string)
        : undefined,
    metadataImage:
      typeof metadata?.image === "string" ? (metadata.image as string) : undefined,
    metadataImageUrl:
      typeof metadata?.imageUrl === "string" ? (metadata.imageUrl as string) : undefined,
  };
}

export function getWearableIconUrlCandidates(
  wearableId: string | number
): string[] {
  const id = String(wearableId);
  const svgUrls = CANONICAL_ICON_BASES.map((base) => `${base}/${id}.svg`);
  const pngUrls = CANONICAL_ICON_BASES.map((base) => `${base}/${id}.png`);
  return [...svgUrls, ...pngUrls];
}

export function getWearableIconUrl(wearableId: string | number): string {
  return getWearableIconUrlCandidates(wearableId)[0];
}

