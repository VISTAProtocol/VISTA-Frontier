import { ponder } from "ponder:registry";
import { postToDashboard } from "./utils/poster";
import { bytes32ToString } from "./utils/bytes32";

ponder.on("VistaEscrow:CampaignCreated", async ({ event }) => {
  const campaignId = bytes32ToString(event.args.campaignId);
  console.log(`[Ponder] CampaignCreated caught — campaign: ${campaignId}`);

  await postToDashboard("/api/campaigns/confirm", {
    campaignIdOnchain: campaignId,
    advertiserWallet: event.args.advertiser,
    totalBudget: event.args.amount.toString(),
    ratePerSecond: event.args.ratePerSecond.toString(),
    confirmedAt: new Date(Number(event.block.timestamp) * 1000).toISOString(),
  });
});

ponder.on("VistaEscrow:CampaignEnded", async ({ event }) => {
  const campaignId = bytes32ToString(event.args.campaignId);
  console.log(`[Ponder] CampaignEnded caught — campaign: ${campaignId}`);

  await postToDashboard("/api/campaigns/end", {
    campaignIdOnchain: campaignId,
    refundedAmount: event.args.refundedAmount.toString(),
    endedAt: new Date(Number(event.block.timestamp) * 1000).toISOString(),
  });
});
