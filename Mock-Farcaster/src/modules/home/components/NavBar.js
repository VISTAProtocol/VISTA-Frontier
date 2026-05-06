"use client";
import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  Circle,
  Copy,
  House,
  LogOut,
  Settings,
  UserRound,
} from "lucide-react";

const NAVBAR_ICONS = {
  Home: House,
  Notifications: Bell,
  Bookmarks: Bookmark,
  Settings,
  Profile: UserRound,
};

// Derive a stable hue from the wallet address so every wallet gets its own color.
function avatarHue(addr) {
  if (!addr) return 142; // green fallback
  const n = parseInt(addr.slice(2, 8), 16);
  return n % 360;
}

function WalletButton({ address, onLogout }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef(null);

  // Close dropdown on outside click/tap (mousedown + touchstart for mobile)
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  const hue = avatarHue(address);
  const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  return (
    <div ref={containerRef} className="relative">
      {/* ── trigger button ── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-left transition hover:bg-white/[0.08] hover:border-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        {/* avatar */}
        <span
          className="h-8 w-8 flex-shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white select-none"
          style={{
            background: `linear-gradient(135deg, hsl(${hue},65%,48%), hsl(${(hue + 40) % 360},70%,38%))`,
          }}
        >
          {address ? address.slice(2, 4).toUpperCase() : "??"}
        </span>

        {/* text */}
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Connected
          </span>
          <span className="block truncate text-sm font-mono font-semibold text-white">
            {short}
          </span>
        </span>

        {/* chevron */}
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 text-zinc-500 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* ── dropdown ── */}
      {/* On desktop sidebar: opens upward (bottom-full). On mobile header: opens downward (top-full). */}
      {/* We use top-full for both contexts since on mobile this sits in a top header bar. */}
      {open && (
        <div className="absolute top-full right-0 mt-2 min-w-[220px] z-[200] rounded-2xl border border-white/10 bg-zinc-900/95 backdrop-blur-sm shadow-2xl shadow-black/50 overflow-hidden lg:bottom-full lg:top-auto lg:mb-2 lg:mt-0 lg:left-0 lg:right-0">
          {/* address row */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5">
            <span
              className="h-7 w-7 flex-shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
              style={{
                background: `linear-gradient(135deg, hsl(${hue},65%,48%), hsl(${(hue + 40) % 360},70%,38%))`,
              }}
            >
              {address ? address.slice(2, 4).toUpperCase() : "??"}
            </span>
            <span className="flex-1 min-w-0 font-mono text-[11px] text-zinc-400 truncate">
              {address}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              title="Copy address"
              className="flex-shrink-0 rounded-lg p-1.5 text-zinc-500 hover:bg-white/10 hover:text-zinc-200 transition"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          {/* disconnect */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onLogout?.();
            }}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10 transition"
          >
            <LogOut className="h-4 w-4" />
            Disconnect wallet
          </button>
        </div>
      )}
    </div>
  );
}

export default function NavBar({ items, isLoggedIn, walletAddress, onLogout }) {
  return (
    <aside className="lg:sticky lg:top-0 z-30 bg-[#06070a] lg:h-screen border-b lg:border-b-0 lg:border-r border-white/10 p-3 sm:p-4 flex flex-row lg:flex-col items-center lg:items-start justify-between lg:justify-start gap-4">
      <a
        href="#"
        className="lg:mb-4 inline-flex items-center gap-3 shrink-0"
        aria-label="Farcaster Clone Home"
      >
        <span className="grid h-7 w-7 place-items-center rounded-md text-xl font-semibold text-white">
          Mirag3
        </span>
      </a>

      <nav className="hidden lg:flex flex-col gap-1 w-full" aria-label="Main navigation">
        {items.map((item, index) => {
          const Icon = NAVBAR_ICONS[item] || Circle;
          return (
            <button
              key={item}
              type="button"
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                index === 0
                  ? "bg-white/10 text-white"
                  : "text-zinc-300 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="text-base">{item}</span>
            </button>
          );
        })}
      </nav>

      {/* spacer */}
      <div className="hidden lg:block flex-1" />

      <div className="lg:px-1 shrink-0 w-auto lg:w-full">
        {isLoggedIn && walletAddress ? (
          <WalletButton address={walletAddress} onLogout={onLogout} />
        ) : (
          <a
            href="/auth"
            className="block w-full rounded-full border border-white/15 bg-white/5 px-4 py-2 text-center text-sm font-semibold text-zinc-200 transition hover:bg-white/10"
          >
            Connect Wallet
          </a>
        )}
      </div>
    </aside>
  );
}
