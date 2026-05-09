import { assertJwt, jsonError, jsonOk } from "@/lib/api";
import { getAggregatedAttention } from "@/lib/identity";

export async function GET(request: Request) {
  try {
    const primary = await assertJwt(request);
    const aggregated = await getAggregatedAttention(primary);
    return jsonOk(aggregated);
  } catch (error) {
    return jsonError(error);
  }
}
