import { SiweMessage, generateNonce } from "siwe";
import { ApiError, jsonError, jsonOk } from "@/lib/api";
import { setNonce } from "@/lib/nonce-store";

export function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address")?.toLowerCase();

    if (!address) throw new ApiError("Missing address parameter.", 400);

    const nonce = generateNonce();
    const host = request.headers.get("host") ?? "localhost:3000";
    const origin = request.headers.get("origin") ?? `http://${host}`;

    const message = new SiweMessage({
      domain: host,
      address,
      statement: "Sign in to VISTA Protocol.",
      uri: origin,
      version: "1",
      chainId: 84532,
      nonce,
    });

    setNonce(address, nonce);

    return jsonOk({ message: message.prepareMessage() });
  } catch (error) {
    return jsonError(error);
  }
}
