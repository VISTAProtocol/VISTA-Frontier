import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import heartbeatRouter from "./routes/heartbeat";
import sessionRouter from "./routes/session";
import { startWatchdog, endSession } from "./services/sessionManager";
import { tickStream, endStream } from "./services/contractCaller";
import { syncTick, syncEnd } from "./services/dashboardSync";
import type { SessionState } from "./types";

const app = express();

app.set("trust proxy", 1);
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(
  rateLimit({
    windowMs: 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
  }),
);

app.use("/heartbeat", heartbeatRouter);
app.use("/session", sessionRouter);

startWatchdog(async (session: SessionState) => {
  if (!session.active) return;
  session.active = false;
  if (!session.onChainStarted) {
    endSession(session.sessionId);
    return;
  }
  try {
    if (session.pendingSeconds > 0) {
      const tick = await tickStream(session, session.pendingSeconds);
      session.pendingSeconds = 0;
      session.totalPaid += tick.userAmount + tick.publisherAmount;
      await syncTick(tick, session); // await: tick must be in DB before syncEnd reads it
    }
    const txHash = await endStream(session);
    await syncEnd(session, txHash);
    endSession(session.sessionId);
  } catch (err) {
    console.error(
      "[watchdog] session cleanup failed for",
      session.sessionId,
      err,
    );
  }
});

const port = Number(process.env.ORACLE_PORT ?? "3001");
app.listen(port, () => {
  console.log(`Vista Oracle Server running on port ${port}`);
});
