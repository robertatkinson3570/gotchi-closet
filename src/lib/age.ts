const AGE_BRS_MILESTONES = [
  { blocks: 1_000_000, brs: 1 },
  { blocks: 2_000_000, brs: 2 },
  { blocks: 3_000_000, brs: 3 },
  { blocks: 5_000_000, brs: 4 },
  { blocks: 8_000_000, brs: 5 },
  { blocks: 13_000_000, brs: 6 },
  { blocks: 21_000_000, brs: 7 },
  { blocks: 34_000_000, brs: 8 },
  { blocks: 55_000_000, brs: 9 },
  { blocks: 89_000_000, brs: 10 },
];

export function ageBRSFromBlocksElapsed(blocksElapsed: number): number {
  const blocks = Number.isFinite(blocksElapsed) ? blocksElapsed : 0;
  let result = 0;
  for (const milestone of AGE_BRS_MILESTONES) {
    if (blocks >= milestone.blocks) {
      result = milestone.brs;
    } else {
      break;
    }
  }
  return result;
}

