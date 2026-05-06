import { keccak256, toBytes, decodeEventLog } from 'viem';
import { publicClient, walletClient, VISTA_STREAM_ABI, VISTA_STREAM_ADDRESS } from '../config';
import type { SessionState, TickResult } from '../types';

export function toBytes32(str: string): `0x${string}` {
  return keccak256(toBytes(str));
}

export async function startStream(session: SessionState): Promise<string> {
  const attempt = async (): Promise<string> => {
    const hash = await walletClient.writeContract({
      address: VISTA_STREAM_ADDRESS,
      abi: VISTA_STREAM_ABI,
      functionName: 'startStream',
      args: [
        toBytes32(session.sessionId),
        session.campaignId as `0x${string}`,
        session.userWallet as `0x${string}`,
        session.publisherWallet as `0x${string}`,
      ],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'reverted') {
      throw new Error(`startStream tx reverted (${hash}) — check campaign ID and budget`);
    }
    return hash;
  };

  try {
    return await attempt();
  } catch (err) {
    console.error(`[${session.sessionId}] startStream first attempt failed, retrying in 2s`, err);
    await new Promise(r => setTimeout(r, 2000));
    try {
      return await attempt();
    } catch (retryErr) {
      console.error(`[${session.sessionId}] startStream retry failed, continuing`, retryErr);
      return '0x';
    }
  }
}

export async function tickStream(session: SessionState, seconds: number): Promise<TickResult> {
  const multiplier = session.flagged ? 0.5 : 1.0;
  const effectiveSeconds = Math.floor(seconds * multiplier);

  if (effectiveSeconds === 0) {
    return {
      sessionId: session.sessionId,
      secondsElapsed: 0,
      txHash: '0x',
      userAmount: 0n,
      publisherAmount: 0n,
    };
  }

  const hash = await walletClient.writeContract({
    address: VISTA_STREAM_ADDRESS,
    abi: VISTA_STREAM_ABI,
    functionName: 'tickStream',
    args: [toBytes32(session.sessionId), BigInt(effectiveSeconds)],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  if (receipt.status === 'reverted') {
    throw new Error(`tickStream tx reverted (${hash}) — campaign may be out of budget or inactive`);
  }

  let userAmount = 0n;
  let publisherAmount = 0n;
  let decoded = false;

  console.log(`[${session.sessionId}] tickStream receipt has ${receipt.logs.length} log(s) to decode`);

  for (const log of receipt.logs) {
    try {
      const decodedLog = decodeEventLog({
        abi: VISTA_STREAM_ABI,
        eventName: 'StreamTick',
        data: log.data,
        topics: log.topics,
      });
      userAmount = decodedLog.args.userAmount;
      publisherAmount = decodedLog.args.publisherAmount;
      decoded = true;
      console.log(`[${session.sessionId}] StreamTick decoded: userAmount=${userAmount} publisherAmount=${publisherAmount}`);
      break;
    } catch {
      // log belongs to a different event, skip
    }
  }

  if (!decoded) {
    console.warn(
      `[${session.sessionId}] WARNING: StreamTick event NOT found in ${receipt.logs.length} log(s). ` +
      `This means the contract did not emit StreamTick — likely escrow is empty or not approved. ` +
      `Raw logs: ${JSON.stringify(receipt.logs.map(l => ({ address: l.address, topics: l.topics })))}`
    );
  }

  console.log(`[${session.sessionId}] TICK ${effectiveSeconds}s txHash:${hash} userAmount:${userAmount} publisherAmount:${publisherAmount}`);

  return {
    sessionId: session.sessionId,
    secondsElapsed: effectiveSeconds,
    txHash: hash,
    userAmount,
    publisherAmount,
  };
}

export async function endStream(session: SessionState): Promise<string> {
  const hash = await walletClient.writeContract({
    address: VISTA_STREAM_ADDRESS,
    abi: VISTA_STREAM_ABI,
    functionName: 'endStream',
    args: [toBytes32(session.sessionId)],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === 'reverted') {
    throw new Error(`endStream tx reverted (${hash})`);
  }
  console.log(`[${session.sessionId}] END totalSeconds:${session.validSeconds} txHash:${hash}`);
  return hash;
}
