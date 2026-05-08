import { jsonError, jsonOk } from "@/lib/api";
import { getPublisherAnalytics } from "@/lib/data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wallet: string }> },
) {
  try {
    return jsonOk(await getPublisherAnalytics((await params).wallet));
  } catch (error) {
    return jsonError(error);
  }
}
