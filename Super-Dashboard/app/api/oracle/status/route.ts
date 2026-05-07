import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import { getOracleNode } from "@/lib/oracle-data";

const querySchema = z.object({
  wallet: z.string().min(6),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
      wallet: searchParams.get("wallet"),
    });
    const node = await getOracleNode(parsed.wallet);
    return jsonOk({ node });
  } catch (error) {
    return jsonError(error);
  }
}
