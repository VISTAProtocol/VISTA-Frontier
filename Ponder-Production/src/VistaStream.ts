import { ponder } from "ponder:registry";
import { postToDashboard } from "./utils/poster";
import { bytes32ToString } from "./utils/bytes32";

ponder.on("VistaStream:StreamStarted", async ({ event }) => {
  const sessionId = bytes32ToString(event.args.sessionId);
  const campaignId = bytes32ToString(event.args.campaignId);
  console.log(`[Ponder] StreamStarted caught — session: ${sessionId} campaign: ${campaignId}`);

  await postToDashboard("/api/sessions", {
    sessionIdOnchain: sessionId,
    campaignIdOnchain: campaignId,
    userWallet: event.args.userWallet,
    publisherWallet: event.args.publisherWallet,
    startedAt: new Date(Number(event.block.timestamp) * 1000).toISOString(),
  });
});

ponder.on("VistaStream:StreamTick", async ({ event }) => {
  const sessionId = bytes32ToString(event.args.sessionId);
  console.log(
    `[Ponder] StreamTick caught — session: ${sessionId} amount: ${event.args.totalAmount.toString()}`
  );

  await postToDashboard("/api/ticks", {
    sessionIdOnchain: sessionId,
    userWallet: event.args.userWallet,
    publisherWallet: event.args.publisherWallet,
    userAmount: event.args.userAmount.toString(),
    publisherAmount: event.args.publisherAmount.toString(),
    totalAmount: event.args.totalAmount.toString(),
    // StreamTick event doesn't include secondsElapsed; oracle always ticks at 5s intervals.
    // For watchdog partial-tick (pendingSeconds < 5), oracle sends via /api/ticks directly with the real value.
    secondsElapsed: 5,
    blockTimestamp: new Date(Number(event.block.timestamp) * 1000).toISOString(),
  });
});

ponder.on("VistaStream:StreamEnded", async ({ event }) => {
  const sessionId = bytes32ToString(event.args.sessionId);
  console.log(
    `[Ponder] StreamEnded caught — session: ${sessionId} totalPaid: ${event.args.totalPaid.toString()}`
  );

  await postToDashboard("/api/sessions/end", {
    sessionIdOnchain: sessionId,
    secondsVerified: Number(event.args.secondsVerified),
    totalPaid: event.args.totalPaid.toString(),
    endedAt: new Date(Number(event.block.timestamp) * 1000).toISOString(),
  });
});
