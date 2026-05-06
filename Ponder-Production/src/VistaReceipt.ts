import { ponder } from "ponder:registry";
import { postToDashboard } from "./utils/poster";
import { bytes32ToString } from "./utils/bytes32";

ponder.on("VistaReceipt:ReceiptMinted", async ({ event }) => {
  const sessionId = bytes32ToString(event.args.sessionId);
  const campaignId = bytes32ToString(event.args.campaignId);
  console.log(
    `[Ponder] ReceiptMinted caught — tokenId: ${event.args.tokenId.toString()} user: ${event.args.user}`
  );

  await postToDashboard("/api/receipts", {
    tokenId: event.args.tokenId.toString(),
    sessionIdOnchain: sessionId,
    userWallet: event.args.user,
    campaignIdOnchain: campaignId,
    secondsVerified: Number(event.args.secondsVerified),
    usdcPaid: event.args.usdcPaid.toString(),
    mintedAt: new Date(Number(event.block.timestamp) * 1000).toISOString(),
  });
});
