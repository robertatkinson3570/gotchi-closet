import { getDebugStats } from "../../../server/aavegotchi/serverSvgService";

export default function handler(_req: any, res: any) {
  res.status(200).json(getDebugStats());
}

