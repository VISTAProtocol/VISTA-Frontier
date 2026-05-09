import { assertJwt, jsonError, jsonOk } from "@/lib/api";
import { getLinkedWallets } from "@/lib/identity";

export async function GET(request: Request) {
  try {
    const primary = await assertJwt(request);
    const links = await getLinkedWallets(primary);
    return jsonOk({ primaryWallet: primary, links });
  } catch (error) {
    return jsonError(error);
  }
}
