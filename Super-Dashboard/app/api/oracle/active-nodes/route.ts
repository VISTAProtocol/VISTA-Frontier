import { jsonError, jsonOk } from "@/lib/api";
import { getActiveOracleNodes } from "@/lib/oracle-data";

export async function GET() {
  try {
    const nodes = await getActiveOracleNodes();
    return jsonOk({ nodes });
  } catch (error) {
    return jsonError(error);
  }
}
