"use client";

import { Activity, Circle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { getBrowserSupabaseClient } from "@/lib/supabase";
import type { LiveTickEvent } from "@/lib/types";
import { cn, normalizeWallet } from "@/lib/utils";

function parseLivePayload(raw: string): LiveTickEvent | null {
  try {
    const message = JSON.parse(raw) as Record<string, unknown>;
    const directPayload = {
      sessionId: message.sessionId,
      userWallet: message.userWallet,
      amount: message.amount,
      timestamp: message.timestamp,
      ratePerSecond: message.ratePerSecond,
      score: message.score,
      verified: message.verified,
      sessionSeconds: message.sessionSeconds,
      secondsElapsed: message.secondsElapsed,
    };
    const nestedPayload =
      typeof message.event === "string" && message.event === "stream_tick"
        ? (message.data as Record<string, unknown> | undefined)
        : undefined;

    const payload = (nestedPayload ?? directPayload) as Record<string, unknown>;

    if (!payload.sessionId || !payload.userWallet) {
      return null;
    }

    return {
      sessionId: String(payload.sessionId),
      userWallet: String(payload.userWallet),
      amount: Number(payload.amount ?? 0),
      timestamp: String(payload.timestamp ?? new Date().toISOString()),
      ratePerSecond:
        payload.ratePerSecond == null
          ? undefined
          : Number(payload.ratePerSecond),
      score: payload.score == null ? undefined : Number(payload.score),
      verified:
        payload.verified == null ? undefined : Boolean(payload.verified),
      sessionSeconds:
        payload.sessionSeconds == null
          ? undefined
          : Number(payload.sessionSeconds),
      secondsElapsed:
        payload.secondsElapsed == null
          ? undefined
          : Number(payload.secondsElapsed),
    };
  } catch {
    return null;
  }
}

export function UsdcCounter({
  walletAddress,
  initialAmount = 0,
  initialSessionSeconds = 0,
  initialRatePerSecond = 0,
  initialVerified = false,
  initialSessionId = null,
  className,
}: {
  walletAddress: string;
  initialAmount?: number;
  initialSessionSeconds?: number;
  initialRatePerSecond?: number;
  initialVerified?: boolean;
  initialSessionId?: string | null;
  className?: string;
}) {
  const [displayAmount, setDisplayAmount] = useState(initialAmount);
  const [targetAmount, setTargetAmount] = useState(initialAmount);
  const [displaySeconds, setDisplaySeconds] = useState(initialSessionSeconds);
  const [targetSeconds, setTargetSeconds] = useState(initialSessionSeconds);
  const [ratePerSecond, setRatePerSecond] = useState(initialRatePerSecond);
  const [verified, setVerified] = useState(initialVerified);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const amountTargetRef = useRef(initialAmount);
  const secondsTargetRef = useRef(initialSessionSeconds);
  const rateRef = useRef(initialRatePerSecond);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const normalizedWallet = normalizeWallet(walletAddress);

  // Load latest session: seconds_verified from sessions table, earned amount from vault_credits for that session only
  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    let cancelled = false;

    async function loadLatestSession() {
      const { data: session } = await supabase!
        .from("sessions")
        .select("session_id_onchain, active, seconds_verified")
        .eq("user_wallet", normalizedWallet)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled || !session) return;

      const row = session as Record<string, unknown>;
      const secs = Number(row.seconds_verified ?? 0);
      const sessionIdOnchain = String(row.session_id_onchain);

      // Sum user_amount from stream_ticks for this session only
      const { data: ticks } = await supabase!
        .from("stream_ticks")
        .select("user_amount")
        .eq("session_id_onchain", sessionIdOnchain);

      if (cancelled) return;

      const sessionEarned = (
        (ticks ?? []) as Array<Record<string, unknown>>
      ).reduce((sum, t) => sum + Number(t.user_amount ?? 0), 0);

      setSessionId(sessionIdOnchain);
      setVerified(Boolean(row.active));
      secondsTargetRef.current = secs;
      setDisplaySeconds(secs);
      setTargetSeconds(secs);
      amountTargetRef.current = sessionEarned;
      setDisplayAmount(sessionEarned);
      setTargetAmount(sessionEarned);
    }

    void loadLatestSession();

    return () => {
      cancelled = true;
    };
  }, [normalizedWallet]);

  useEffect(() => {
    amountTargetRef.current = targetAmount;
  }, [targetAmount]);

  useEffect(() => {
    secondsTargetRef.current = targetSeconds;
  }, [targetSeconds]);

  useEffect(() => {
    rateRef.current = ratePerSecond;
  }, [ratePerSecond]);

  useEffect(() => {
    function animate(frame: number) {
      if (lastFrameRef.current == null) {
        lastFrameRef.current = frame;
      }

      const deltaSeconds = (frame - lastFrameRef.current) / 1000;
      lastFrameRef.current = frame;

      setDisplayAmount((current) => {
        if (current >= amountTargetRef.current) {
          return current;
        }

        return Math.min(
          amountTargetRef.current,
          current + rateRef.current * deltaSeconds,
        );
      });

      setDisplaySeconds((current) => {
        if (current >= secondsTargetRef.current) {
          return current;
        }

        return Math.min(secondsTargetRef.current, current + deltaSeconds);
      });

      rafRef.current = window.requestAnimationFrame(animate);
    }

    rafRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function applyPayload(payload: LiveTickEvent) {
      if (normalizeWallet(payload.userWallet) !== normalizedWallet) {
        return;
      }

      const secondsIncrement = payload.secondsElapsed ?? 5;
      const nextRate =
        payload.ratePerSecond ??
        (payload.amount > 0 ? payload.amount / secondsIncrement : 0);

      if (payload.sessionId) {
        setSessionId(payload.sessionId);
      }

      setTargetSeconds(
        (current) => payload.sessionSeconds ?? current + secondsIncrement,
      );
      setRatePerSecond(nextRate);
      setVerified(payload.verified ?? (payload.score ?? 1) >= 0.6);
    }

    const wsUrl = process.env.NEXT_PUBLIC_ORACLE_WS_URL;
    const browserSupabase = getBrowserSupabaseClient();
    let websocket: WebSocket | null = null;

    if (wsUrl) {
      websocket = new WebSocket(wsUrl);
      websocket.onmessage = (event) => {
        const payload = parseLivePayload(event.data);
        if (payload) {
          applyPayload(payload);
        }
      };
    }

    const channel = browserSupabase
      ?.channel(`vista-counter-${normalizedWallet}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "stream_ticks",
        },
        (payload) => {
          const next = payload.new as Record<string, unknown>;
          if (
            normalizeWallet(String(next.user_wallet ?? "")) !== normalizedWallet
          ) {
            return;
          }

          applyPayload({
            sessionId: String(next.session_id_onchain ?? ""),
            userWallet: String(next.user_wallet ?? ""),
            amount: Number(next.user_amount ?? 0),
            timestamp: String(next.block_timestamp ?? new Date().toISOString()),
            ratePerSecond:
              Number(next.user_amount ?? 0) /
              Math.max(Number(next.seconds_elapsed ?? 5), 1),
            verified: true,
            secondsElapsed: Number(next.seconds_elapsed ?? 5),
          });
        },
      )
      .subscribe();

    return () => {
      websocket?.close();
      if (channel && browserSupabase) {
        void browserSupabase.removeChannel(channel);
      }
    };
  }, [normalizedWallet]);

  return (
    <Card
      className={cn(
        "overflow-hidden border-border/80 bg-[linear-gradient(135deg,rgba(57,185,118,0.16),rgba(255,255,255,0.88)_45%,rgba(90,102,241,0.08))] dark:bg-[linear-gradient(135deg,rgba(57,185,118,0.16),rgba(18,24,30,0.95)_45%,rgba(90,102,241,0.10))]",
        className,
      )}
    >
      <CardContent className="space-y-6 p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
              You&apos;ve earned this session
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-lg text-muted-foreground">$</span>
              <span className="text-4xl font-semibold tracking-tight sm:text-5xl">
                {displayAmount.toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                })}
              </span>
              <span className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
                USDC
              </span>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/80 p-3 text-primary shadow-sm">
            <Activity className="size-5" />
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-border/70 bg-background/75 p-4 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <Circle
              className={cn(
                "size-3 animate-pulse fill-current",
                verified ? "text-primary" : "text-muted-foreground",
              )}
            />
            <span
              className={cn(
                "text-sm font-medium",
                verified ? "text-primary" : "text-muted-foreground",
              )}
            >
              {verified ? "Attention verified" : "Attention pending"}
            </span>
          </div>
          <div className="text-sm text-muted-foreground sm:text-right">
            Session: {Math.floor(displaySeconds)} seconds verified
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-muted-foreground">
          <span>Session ID</span>
          <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1 text-foreground">
            {sessionId ? `${sessionId.slice(0, 10)}...` : "Waiting for stream"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
