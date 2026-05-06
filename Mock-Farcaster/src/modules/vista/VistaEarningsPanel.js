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
  const {
    earnings = totalEarned,
    validSeconds: vistaValidSeconds = validSeconds,
    isActive = isTracking,
    flagged = false,
    tickAmount = 0,
  } = vistaState ?? {};

  const [displaySeconds, setDisplaySeconds] = useState(vistaValidSeconds);
  const [flash, setFlash] = useState(false);
  const finalEarnings = earnings || totalEarned;

  // Historical stats fetched from Supabase
  const [stats, setStats] = useState({
    lastSession: 0,
    total: 0,
    unclaimed: 0,
    loading: true,
  });
  const latestSessionIdRef = useRef(null);

  // ── Supabase fetch + Realtime ──────────────────────────────
  useEffect(() => {
    const wallet = userWallet?.toLowerCase();
    if (!wallet) {
      setStats({ lastSession: 0, total: 0, unclaimed: 0, loading: false });
      return;
    }

    const supabase = getBrowserSupabaseClient();
    if (!supabase) {
      setStats((s) => ({ ...s, loading: false }));
      return;
    }

    let cancelled = false;

    async function loadStats() {
      // 1. Latest session
      const { data: session } = await supabase
        .from("sessions")
        .select("session_id_onchain, seconds_verified")
        .eq("user_wallet", wallet)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      const latestId = session?.session_id_onchain ?? null;
      latestSessionIdRef.current = latestId;

      // 2. Last-session earnings
      let lastSession = 0;
      if (latestId) {
        const { data: sessionTicks } = await supabase
          .from("stream_ticks")
          .select("user_amount")
          .eq("session_id_onchain", latestId);
        lastSession = (sessionTicks ?? []).reduce(
          (sum, t) => sum + Number(t.user_amount ?? 0),
          0,
        );
      }

      // 3. All-time earnings
      const { data: allTicks } = await supabase
        .from("stream_ticks")
        .select("user_amount")
        .eq("user_wallet", wallet);
      const total = (allTicks ?? []).reduce(
        (sum, t) => sum + Number(t.user_amount ?? 0),
        0,
      );

      if (!cancelled) {
        setStats({ lastSession, total, unclaimed: total, loading: false });
      }
    }

    void loadStats();

    // Live updates: new ticks inserted while the panel is open
    const channel = supabase
      .channel(`vista-panel-${wallet}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "stream_ticks" },
        (payload) => {
          const row = payload.new;
          if (row.user_wallet?.toLowerCase() !== wallet) return;
          const amount = Number(row.user_amount ?? 0);
          const isLatest = row.session_id_onchain === latestSessionIdRef.current;
          setStats((s) => ({
            ...s,
            lastSession: isLatest ? s.lastSession + amount : s.lastSession,
            total: s.total + amount,
            unclaimed: s.unclaimed + amount,
          }));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [userWallet]);

  // ── Live second counter ───────────────────────────────────
  useEffect(() => {
    setDisplaySeconds(vistaValidSeconds || validSeconds);
  }, [vistaValidSeconds, validSeconds]);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setDisplaySeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [isActive]);

  // ── Earn flash ────────────────────────────────────────────
  useEffect(() => {
    if (tickAmount === 0) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [tickAmount]);

  // ── Animated stat values ──────────────────────────────────
  const animLastSession = useCountUp(stats.lastSession);
  const animTotal       = useCountUp(stats.total);
  const animUnclaimed   = useCountUp(stats.unclaimed);

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
            {isActive && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                isActive ? "bg-green-500" : "bg-zinc-600"
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

      {/* Live session earnings */}
      {(isActive || finalEarnings > 0) && (
        <div>
          <p className="text-xs uppercase tracking-wider text-green-400">
            Current Session
          </p>
          <p
            className={`mt-1 text-2xl font-semibold font-mono transition-colors duration-300 ${
              flash ? "text-green-300" : "text-white"
            }`}
          >
            {typeof finalEarnings === "number"
              ? finalEarnings.toFixed(6)
              : "0.000000"}{" "}
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
      {isActive && (
        <div className="border-t border-white/5 pt-3 text-xs text-zinc-400">
          <p className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-green-400 animate-pulse" />
            Attention verified • {displaySeconds}s tracked
          </p>
        </div>
      )}
    </div>
  );
}
