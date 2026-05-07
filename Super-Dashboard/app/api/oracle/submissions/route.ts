import { z } from "zod";

import { jsonError, jsonOk } from "@/lib/api";
import {
  getOracleSubmissions,
  getOracleSubmissionsForSession,
} from "@/lib/oracle-data";

const querySchema = z.object({
  wallet: z.string().min(6).optional(),
  session: z.string().min(6).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.parse({
      wallet: searchParams.get("wallet") ?? undefined,
      session: searchParams.get("session") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    });

    if (parsed.session) {
      const submissions = await getOracleSubmissionsForSession(parsed.session);
      return jsonOk({ submissions });
    }
    if (!parsed.wallet) {
      return jsonOk({ submissions: [] });
    }
    const submissions = await getOracleSubmissions(
      parsed.wallet,
      parsed.limit ?? 20,
    );
    return jsonOk({ submissions });
  } catch (error) {
    return jsonError(error);
  }
}
