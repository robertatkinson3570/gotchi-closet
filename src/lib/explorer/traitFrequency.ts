import type { ExplorerGotchi } from "./types";

export type EyeData = {
  shape: number;
  color: number;
  shapeRarity: string;
  colorRarity: string;
  comboRarity: string;
};

const eyeShapeNames: Record<number, string> = {
  0: "Normal",
  1: "Kawaii",
  2: "Creepy",
  3: "Cool",
  4: "Skeptical",
  5: "Shocked",
  6: "Diamond",
  7: "Almond",
};

const eyeColorNames: Record<number, string> = {
  0: "Brown",
  1: "Hazel",
  2: "Green",
  3: "Blue",
  4: "Purple",
  5: "Pink",
  6: "Red",
  7: "Black",
};

export function getEyeShapeName(shape: number): string {
  return eyeShapeNames[shape] || `Shape ${shape}`;
}

export function getEyeColorName(color: number): string {
  return eyeColorNames[color] || `Color ${color}`;
}

export function extractEyeData(gotchi: ExplorerGotchi): EyeData {
  const traits = gotchi.numericTraits;
  const eyeShape = traits.length > 4 ? traits[4] : 0;
  const eyeColor = traits.length > 5 ? traits[5] : 0;

  return {
    shape: eyeShape,
    color: eyeColor,
    shapeRarity: `1/${Math.max(1, Math.floor(100 / (Math.abs(50 - eyeShape) + 1)))}`,
    colorRarity: `1/${Math.max(1, Math.floor(100 / (Math.abs(50 - eyeColor) + 1)))}`,
    comboRarity: `1/${Math.max(1, Math.floor(10000 / ((Math.abs(50 - eyeShape) + 1) * (Math.abs(50 - eyeColor) + 1))))}`,
  };
}

export function computeTraitFrequencies(
  gotchis: ExplorerGotchi[],
  hauntId?: number
): Map<string, number> {
  const filtered = hauntId
    ? gotchis.filter((g) => g.hauntId === hauntId)
    : gotchis;

  const counts = new Map<string, number>();

  for (const g of filtered) {
    const traits = g.numericTraits;
    if (traits.length >= 6) {
      const eyeShape = traits[4];
      const eyeColor = traits[5];
      const shapeKey = `shape:${eyeShape}`;
      const colorKey = `color:${eyeColor}`;
      const comboKey = `combo:${eyeShape}:${eyeColor}`;

      counts.set(shapeKey, (counts.get(shapeKey) || 0) + 1);
      counts.set(colorKey, (counts.get(colorKey) || 0) + 1);
      counts.set(comboKey, (counts.get(comboKey) || 0) + 1);
    }
  }

  return counts;
}
