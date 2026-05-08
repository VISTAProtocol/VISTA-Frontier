import { jsonError, jsonOk } from "@/lib/api";
import { getCampaignBridgeStatus } from "@/lib/data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ campaignId: string }> },
) {
  try {
    const id = (await params).campaignId;
    if (!id) return jsonError(new Error("missing campaignId"));
    const row = await getCampaignBridgeStatus(id);
    if (!row) return jsonError(new Error("campaign not found"));
    return jsonOk(row);
  } catch (error) {
    return jsonError(error);
  }
}
