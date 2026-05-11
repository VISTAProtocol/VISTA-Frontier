"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase";

// Animate a numeric value from its previous target to a new target.
function useCountUp(target, duration = 750) {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = target;
    if (from === to) return;

    const startTime = performance.now();
    let rafId;
    const tick = (now) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (to - from) * eased);
      if (t < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [target, duration]);

  return value;
}

export default function VistaEarningsPanel({
  vistaState,
  userWallet,
  totalEarned = 0,
  validSeconds = 0,
  isTracking = false,
}) {
  // vistaState is optional — when a parent (e.g. ad zone) is wired up it
  // gives us instant per-tick deltas for the flash animation. The rest of
  // the panel drives entirely from Supabase so the values stay realtime
  // regardless of whether this prop is passed.
  const {
    flagged = false,
    tickAmount: parentTick = 0,
  } = vistaState ?? {};

  const [flash, setFlash] = useState(false);

  // Aggregated state pulled from Supabase + kept in sync via Realtime.
  const [stats, setStats] = useState({
    currentSession: 0,
    currentSessionSeconds: 0,
    isActive: isTracking,
    lastSession: 0,
    total: totalEarned,
    unclaimed: totalEarned,
    loading: true,
  });
  const latestSessionIdRef = useRef(null);

  // Live "seconds since last tick" — increments each second while the
  // session is active so the counter doesn't sit between oracle ticks.
  const [liveSecondsOffset, setLiveSecondsOffset] = useState(0);

  // ── Supabase fetch + Realtime ──────────────────────────────
  useEffect(() => {
    // Solana base58 pubkeys are case-sensitive — keep the wallet exactly as
    // stored upstream.
    const wallet = userWallet?.trim();
    if (!wallet) {
      setStats({
        currentSession: 0,
        currentSessionSeconds: 0,
        isActive: false,
        lastSession: 0,
        total: 0,
        unclaimed: 0,
        loading: false,
      });
      return;
    }

    const supabase = getBrowserSupabaseClient();
    if (!supabase) {
      setStats((s) => ({ ...s, loading: false }));
      return;
    }

    let cancelled = false;

    async function loadStats() {
      try {
        // 1. Latest session for this wallet (any status — we want the
        //    "current/last session" pane to reflect what just happened
        //    even if the session has already ended).
        const { data: session } = await supabase
          .from("sessions")
          .select("session_id_onchain, active, seconds_verified")
          .eq("user_wallet", wallet)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const latestId = session?.session_id_onchain ?? null;
        latestSessionIdRef.current = latestId;
        const isActive = Boolean(session?.active);
        const sessionSecondsVerified = Number(session?.seconds_verified ?? 0);

        // 2. Stream ticks for the latest session — canonical source for
        //    "current session" earnings + seconds.
        let currentSession = 0;
        let currentSessionSeconds = 0;
        if (latestId) {
          const { data: sessionTicks } = await supabase
            .from("stream_ticks")
            .select("user_amount, seconds_elapsed")
            .eq("session_id_onchain", latestId);
          for (const t of sessionTicks ?? []) {
            currentSession += Number(t.user_amount ?? 0);
            currentSessionSeconds += Number(t.seconds_elapsed ?? 0);
          }
          currentSessionSeconds = Math.max(
            currentSessionSeconds,
            sessionSecondsVerified,
          );
        }

        // 3. All-time earnings across every session for this wallet.
        const { data: allTicks } = await supabase
          .from("stream_ticks")
          .select("user_amount")
          .eq("user_wallet", wallet);
        const total = (allTicks ?? []).reduce(
          (sum, t) => sum + Number(t.user_amount ?? 0),
          0,
        );

        if (cancelled) return;
        setStats({
          currentSession,
          currentSessionSeconds,
          isActive,
          // For the "Last Session" cell we surface what they just earned
          // in the most recent session, regardless of whether it's still
          // open. This mirrors the live "Current Session" counter and is
          // what a viewer expects to see.
          lastSession: currentSession,
          total,
          unclaimed: total,
          loading: false,
        });
        setLiveSecondsOffset(0);
      } catch (err) {
        console.warn("[VistaEarningsPanel] loadStats failed:", err);
        if (!cancelled) {
          setStats((s) => ({ ...s, loading: false }));
        }
      }
    }

    void loadStats();

    // Realtime channel: subscribe to ticks and sessions for this wallet.
    const channel = supabase
      .channel(`vista-panel-${wallet}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stream_ticks" },
        (payload) => {
          const row = payload.new;
          if (!row || row.user_wallet !== wallet) return;
          const amount = Number(row.user_amount ?? 0);
          const seconds = Number(row.seconds_elapsed ?? 0);
          const isLatest =
            row.session_id_onchain === latestSessionIdRef.current;

          setStats((s) => ({
            ...s,
            currentSession: isLatest
              ? s.currentSession + amount
              : // Tick belongs to a session that started AFTER the one we
                // had cached — treat it as the new "current".
                amount,
            currentSessionSeconds: isLatest
              ? s.currentSessionSeconds + seconds
              : seconds,
            lastSession: isLatest ? s.lastSession + amount : amount,
            total: s.total + amount,
            unclaimed: s.unclaimed + amount,
            isActive: true,
          }));
          if (!isLatest) {
            latestSessionIdRef.current = row.session_id_onchain;
          }
          setLiveSecondsOffset(0);
          setFlash(true);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
          filter: `user_wallet=eq.${wallet}`,
        },
        (payload) => {
          const row = payload.new ?? payload.old;
          if (!row) return;
          // A brand-new session for this wallet — switch the latest ref
          // so subsequent ticks accrue into a fresh "Current Session".
          if (
            payload.eventType === "INSERT" &&
            row.session_id_onchain !== latestSessionIdRef.current
          ) {
            latestSessionIdRef.current = row.session_id_onchain;
            setStats((s) => ({
              ...s,
              currentSession: 0,
              currentSessionSeconds: 0,
              lastSession: 0,
              isActive: Boolean(row.active),
            }));
            setLiveSecondsOffset(0);
            return;
          }

          // Status flipped on the current session.
          if (row.session_id_onchain === latestSessionIdRef.current) {
            setStats((s) => ({ ...s, isActive: Boolean(row.active) }));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userWallet]);

  // ── Flash animation: any new tick (Supabase or parent SDK) ───────
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    if (parentTick > 0) setFlash(true);
  }, [parentTick]);

  // ── Live second counter between ticks ─────────────────────────
  useEffect(() => {
    if (!stats.isActive) return;
    const id = setInterval(() => setLiveSecondsOffset((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [stats.isActive]);

  // ── Animated stat values ──────────────────────────────────
  const animCurrent = useCountUp(stats.currentSession);
  const animLastSession = useCountUp(stats.lastSession);
  const animTotal = useCountUp(stats.total);
  const animUnclaimed = useCountUp(stats.unclaimed);

  const displaySeconds = stats.currentSessionSeconds + liveSecondsOffset;

  // ── No wallet ─────────────────────────────────────────────
  if (!userWallet) {
    return (
      <div className="rounded-2xl border border-white/10 bg-[#0b0b0f] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <p className="text-sm font-semibold text-zinc-300">✦ VISTA Earnings</p>
        </div>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Earn USDC from ads while reading. Connect your wallet to start.
        </p>
        <Link
          href="/auth"
          className="inline-flex w-full items-center justify-center rounded-xl bg-linear-to-br from-green-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110 transition"
        >
          Connect Wallet
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border bg-[#0b0b0f] p-4 space-y-4 transition-colors duration-300 ${
        flash ? "border-green-500/60" : "border-white/10"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {stats.isActive && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                stats.isActive ? "bg-green-500" : "bg-zinc-600"
              }`}
            />
          </span>
          <p className="text-sm font-semibold text-zinc-300">✦ VISTA Earnings</p>
        </div>
        {flagged && (
          <span className="text-xs text-amber-400 border border-amber-400/30 rounded-full px-2 py-0.5">
            Reviewing
          </span>
        )}
      </div>

      {/* Current session earnings — always shown when there's a session,
          regardless of whether vistaState was passed. */}
      {(stats.isActive || stats.currentSession > 0) && (
        <div>
          <p className="text-xs uppercase tracking-wider text-green-400">
            Current Session
          </p>
          <p
            className={`mt-1 text-2xl font-semibold font-mono transition-colors duration-300 ${
              flash ? "text-green-300" : "text-white"
            }`}
          >
            {animCurrent.toFixed(6)}{" "}
            <span className="text-sm text-zinc-400">USDC</span>
          </p>
        </div>
      )}

      {/* Historical stats */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10">
        <div className="flex flex-col gap-1">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Last Session
          </p>
          <p className="text-xs font-mono text-zinc-300">
            {stats.loading ? (
              <span className="inline-block h-3 w-14 animate-pulse rounded bg-white/10" />
            ) : (
              animLastSession.toFixed(6)
            )}
          </p>
        </div>
        <div className="flex flex-col gap-1 border-l border-white/10 pl-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">
            Total Earned
          </p>
          <p className="text-xs font-mono text-zinc-300">
            {stats.loading ? (
              <span className="inline-block h-3 w-14 animate-pulse rounded bg-white/10" />
            ) : (
              animTotal.toFixed(6)
            )}
          </p>
        </div>
        <div className="flex flex-col gap-1 border-l border-white/10 pl-2">
          <p className="text-[10px] uppercase tracking-wider text-green-400">
            Unclaimed
          </p>
          <p className="text-xs font-mono font-semibold text-green-400">
            {stats.loading ? (
              <span className="inline-block h-3 w-14 animate-pulse rounded bg-green-400/10" />
            ) : (
              animUnclaimed.toFixed(6)
            )}
          </p>
        </div>
      </div>

      {/* Live tracking footer */}
      {stats.isActive && (
        <div className="border-t border-white/5 pt-3 text-xs text-zinc-400">
          <p className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            Attention verified • {displaySeconds}s tracked
          </p>
        </div>
      )}

      {/* Idle state — keep validSeconds visible if a parent passed one */}
      {!stats.isActive && (validSeconds > 0 || stats.currentSessionSeconds > 0) && (
        <div className="border-t border-white/5 pt-3 text-xs text-zinc-500">
          Last session ran for {stats.currentSessionSeconds || validSeconds}s.
        </div>
      )}
    </div>
  );
}
