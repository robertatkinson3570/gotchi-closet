export type TraitTuple = [number, number, number, number, number, number];

export type SpotlightProps = {
  videoId: string;
  gotchiId: string;
  name: string;
  svg: string;
  traits: TraitTuple;
  brs: number;
  kinship: number;
  level: number;
  ageDays: number;
  setName: string | null;
  ownerShort: string;
  flavor: string;
};

export type FitStep = {
  svg: string;
  wearableId: number;
  wearableName: string;
  slotLabel: string;
  brs: number;
};

export type FitRevealProps = {
  videoId: string;
  gotchiId: string;
  name: string;
  nakedSvg: string;
  nakedBrs: number;
  steps: FitStep[];
  finalBrs: number;
  setName: string | null;
  setBonusBrs: number;
};

export type SaleAlertProps = {
  videoId: string;
  gotchiId: string;
  name: string;
  svg: string;
  priceGhst: number;
  priceUsd: number | null;
  traits: TraitTuple;
  brs: number;
  buyerShort: string;
  sellerShort: string;
  whenText: string;
};

export type PulseStat = {
  label: string;
  value: number;
  unit: string;
  wow: number | null; // week-over-week percent (pulse pctChange), e.g. 12 = +12%
};

export type PulseCameo = { svg: string; name: string; caption: string };

export type PulseRecapProps = {
  videoId: string;
  weekLabel: string;
  stats: PulseStat[];
  cameos: PulseCameo[];
  greens: number;
  reds: number;
};
