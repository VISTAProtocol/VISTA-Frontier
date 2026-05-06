import { ponder } from "ponder:registry";
import { postToDashboard } from "./utils/poster";
import { bytes32ToString } from "./utils/bytes32";

ponder.on("VistaVault:Credited", async ({ event }) => {
  const sessionId = bytes32ToString(event.args.sessionId);
  const campaignId = bytes32ToString(event.args.campaignId);
  console.log(
    `[Ponder] Credited caught — wallet: ${event.args.wallet} session: ${sessionId} amount: ${event.args.amount.toString()}`
  );

  await postToDashboard("/api/vault/credit", {
    walletAddress: event.args.wallet,
    sessionIdOnchain: sessionId,
    campaignIdOnchain: campaignId,
    amount: event.args.amount.toString(),
    role: Number(event.args.role),
    creditedAt: new Date(Number(event.block.timestamp) * 1000).toISOString(),
  });
});

ponder.on("VistaVault:Withdrawn", async ({ event }) => {
  console.log(
    `[Ponder] Withdrawn caught — wallet: ${event.args.wallet} amount: ${event.args.amount.toString()}`
  );

  await postToDashboard("/api/vault/withdraw", {
    walletAddress: event.args.wallet,
    amount: event.args.amount.toString(),
    withdrawnAt: new Date(Number(event.block.timestamp) * 1000).toISOString(),
  });
});
