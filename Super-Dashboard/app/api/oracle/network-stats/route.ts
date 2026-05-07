import { jsonError, jsonOk } from "@/lib/api";
import { getOracleNetworkStats } from "@/lib/oracle-data";

export async function GET() {
  try {
    const stats = await getOracleNetworkStats();
    return jsonOk(stats);
  } catch (error) {
    return jsonError(error);
  }
}
