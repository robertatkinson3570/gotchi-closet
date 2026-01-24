export const config = { runtime: "nodejs" };

export default function handler(_req: any, res: any) {
  res.status(200).json({
    ok: true,
    now: new Date().toISOString(),
    node: process.version,
    hasEnv: {
      VITE_GOTCHI_SUBGRAPH_URL: Boolean(process.env.VITE_GOTCHI_SUBGRAPH_URL),
      VITE_BASE_RPC_URL: Boolean(process.env.VITE_BASE_RPC_URL),
      VITE_GOTCHI_DIAMOND_ADDRESS: Boolean(process.env.VITE_GOTCHI_DIAMOND_ADDRESS),
    },
  });
}

