"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowRight, ExternalLink } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { WalletConnectButton } from "@/components/wallet-connect-button";
import { RoleSwitcher } from "@/components/role-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_TAGLINE, roleMeta } from "@/lib/constants";
import { fetchJson } from "@/lib/http";
import type { RoleName } from "@/lib/types";
import { cn } from "@/lib/utils";

const tickerItems = [
  "ATTENTION MONETIZATION PROTOCOL",
  "VERIFIED ON BASE MAINNET",
  "USDC STREAMS EVERY 10 SECONDS",
  "OPEN SOURCE · PERMISSIONLESS",
  "ORACLE-VERIFIED ATTENTION",
  "NO COOKIES · NO MIDDLEMEN",
];

const roleCards: Record<
  RoleName,
  {
    tab: string;
    badge: string;
    title: string;
    sub: string;
    icon: string;
    metrics: Array<{ value: string; label: string }>;
    bullets: string[];
    cta: string;
  }
> = {
  advertiser: {
    tab: "Advertiser",
    badge: "Launch",
    title: "Stop buying impressions. Start buying attention.",
    sub: "VISTA streams USDC only when viewers are provably watching. Zero wasted spend. Every cent is an on-chain receipt.",
    icon: "/role-icons/advertiser.webp",
    metrics: [
      { value: "0 wasted", label: "impressions on unverified eyes" },
      { value: "10s", label: "oracle tick interval" },
      { value: "6-decimal", label: "USDC precision per second" },
    ],
    bullets: [
      "Deposit budget once — stream per verified second",
      "Pause or kill campaigns instantly, on-chain",
      "Audience targeting by age, location, preference",
    ],
    cta: "Enter as Advertiser",
  },
  publisher: {
    tab: "Publisher",
    badge: "Monetize",
    title: "Your platform earns every second your audience pays attention.",
    sub: "One SDK call. VISTA handles oracle verification, USDC settlement, and real-time analytics. You collect 50% of every stream tick.",
    icon: "/role-icons/publisher.webp",
    metrics: [
      { value: "50%", label: "of every tick goes to you" },
      { value: "~2min", label: "average SDK integration time" },
      { value: "Live", label: "session quality analytics" },
    ],
    bullets: [
      "Attach a monetization zone with two lines of code",
      "Real-time revenue dashboard via Supabase Realtime",
      "Per-slot analytics: know your best-performing timeslots",
    ],
    cta: "Enter as Publisher",
  },
  user: {
    tab: "End User",
    badge: "Earn",
    title: "You've been the product for 20 years. Time to get paid.",
    sub: "Watch ads, verify attention, earn USDC — all on-chain. Every session mints a receipt NFT. Your earnings are yours, streaming live.",
    icon: "/role-icons/end-user.webp",
    metrics: [
      { value: "100%", label: "transparent payout, on-chain" },
      { value: "Live", label: "USDC counter while you watch" },
      { value: "NFT", label: "receipt minted per session" },
    ],
    bullets: [
      "Connect wallet → watch → earn. That's the whole flow",
      "Attention verified by oracle, not just click fraud",
      "See every dollar, every second, on Base Sepolia",
    ],
    cta: "Enter as User",
  },
  oracle: {
    tab: "Oracle",
    badge: "Validate",
    title: "Stake USDC. Verify human attention. Earn validator rewards.",
    sub: "Run an oracle node, independently verify attention sessions, and split 10% of every ad dollar with other honest validators. Dishonest scores get slashed.",
    icon: "/role-icons/end-user.webp",
    metrics: [
      { value: "100 USDC", label: "minimum stake (devnet)" },
      { value: "10%", label: "of every tick to validators" },
      { value: "10%", label: "stake slashed for outliers" },
    ],
    bullets: [
      "Permissionless: stake USDC and start validating",
      "Multi-oracle consensus: outliers get slashed automatically",
      "Trustless attention market — no central operator required",
    ],
    cta: "Enter as Oracle",
  },
};

export default function HomePage() {
  const router = useRouter();
  const { openConnectModal } = useConnectModal();
  const { address, isConnected } = useAccount();
  const [activeRole, setActiveRole] = useState<RoleName>("advertiser");
  const [imageLoaded, setImageLoaded] = useState(false);
  const [pendingRole, setPendingRole] = useState<RoleName | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [counter, setCounter] = useState(0.00341);
  const [demoCursor, setDemoCursor] = useState({ x: 0, y: 0, active: false });
  const [footprints, setFootprints] = useState<
    Array<{ id: number; x: number; y: number }>
  >([]);
  const trailIdRef = useRef(0);
  const lastTrailStampRef = useRef(0);

  function startStreaming() {
    setStreaming(true);
  }

  function stopStreaming() {
    setStreaming(false);
  }

  function handleDemoMove(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const now = performance.now();

    setDemoCursor({ x, y, active: true });

    if (now - lastTrailStampRef.current < 28) {
      return;
    }

    lastTrailStampRef.current = now;
    const id = trailIdRef.current;
    trailIdRef.current += 1;

    setFootprints((prev) => [...prev.slice(-20), { id, x, y }]);
  }

  function handleDemoEnter() {
    startStreaming();
    setDemoCursor((current) => ({ ...current, active: true }));
  }

  function handleDemoLeave() {
    stopStreaming();
    setDemoCursor((current) => ({ ...current, active: false }));
    setFootprints([]);
  }

  useEffect(() => {
    let frame: number | null = null;
    let last = 0;

    const tick = (now: number) => {
      if (!last) {
        last = now;
      }

      const delta = (now - last) / 1000;
      last = now;

      if (streaming) {
        setCounter((current) => current + 0.000074 * delta);
      }

      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [streaming]);

  async function handleEnterRole(role: RoleName) {
    if (!isConnected || !address) {
      openConnectModal?.();
      return;
    }

    try {
      setPendingRole(role);
      const status = await fetchJson<{ registered: boolean }>(
        `/api/roles/status?role=${role}&wallet=${address}`,
      );
      const destination = status.registered
        ? roleMeta[role].dashboardPath
        : roleMeta[role].onboardingPath;
      router.push(destination);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to open the selected workspace.",
      );
    } finally {
      setPendingRole(null);
    }
  }
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(57,185,118,0.20),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(90,102,241,0.14),_transparent_30%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-[32px] border border-border/70 bg-background/80 p-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BrandMark compact />
            <Badge variant="outline">Testnet</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              className="rounded-lg border border-border/70 px-3 py-1 transition-colors hover:border-primary/40 hover:text-foreground"
              href="#how-it-works"
            >
              How it Works
            </Link>
            <RoleSwitcher />
            <Link
              className="rounded-lg border border-border/70 px-3 py-1 transition-colors hover:border-primary/40 hover:text-foreground"
              href="#docs"
            >
              Docs
            </Link>
            <WalletConnectButton />
            <ThemeToggle />
          </div>
        </header>

        <section className="overflow-hidden rounded-[20px] border border-border/70 bg-muted/30 px-2 py-2 text-xs uppercase tracking-[0.34em] text-muted-foreground">
          <div className="vista-marquee whitespace-nowrap">
            {[...tickerItems, ...tickerItems].map((item, index) => (
              <span className="mx-5" key={`${item}-${index}`}>
                {item}
              </span>
            ))}
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="overflow-hidden rounded-[32px] border border-border/70 bg-card/90 p-8 shadow-sm shadow-black/5 sm:p-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.26em] text-primary">
              Live on Base Sepolia · Attention streaming
            </div>
            <div className="mt-6 space-y-6">
              <div className="space-y-4">
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                  The ad industry steals your attention.
                </h1>
                <h2 className="max-w-3xl text-4xl font-semibold tracking-tight text-primary text-balance sm:text-5xl lg:text-6xl">
                  VISTA pays you for it.
                </h2>
                <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                  {APP_TAGLINE} For viewers, publishers, and advertisers. No
                  middlemen. No click fraud. No empty promises.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button size="lg" onClick={() => handleEnterRole("user")}>
                  Start Earning USDC →
                </Button>
                <Button size="lg" variant="outline">
                  <Link href="#docs">Read the Docs</Link>
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card className="bg-muted/40">
                  <CardContent className="space-y-1 p-4">
                    <p className="text-lg font-semibold tracking-tight">
                      Every 10s
                    </p>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      oracle tick interval
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/40">
                  <CardContent className="space-y-1 p-4">
                    <p className="text-lg font-semibold tracking-tight">50%</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      publisher revenue share
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/40">
                  <CardContent className="space-y-1 p-4">
                    <p className="text-lg font-semibold tracking-tight">
                      6 decimals
                    </p>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      USDC precision
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-muted/40">
                  <CardContent className="space-y-1 p-4">
                    <p className="text-lg font-semibold tracking-tight">100%</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      on-chain verifiable
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          <Card className="overflow-hidden rounded-[32px] bg-[linear-gradient(180deg,rgba(57,185,118,0.10),transparent)] lg:min-h-[640px]">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                Live Demo — Hover to Stream
              </CardTitle>
            </CardHeader>
            <CardContent className="flex h-full flex-col">
              <div
                className="hover-stage relative flex flex-1 flex-col items-center justify-center rounded-[24px] border border-border/70 bg-background/70 p-6 text-center"
                onMouseEnter={handleDemoEnter}
                onMouseLeave={handleDemoLeave}
                onMouseMove={handleDemoMove}
              >
                {footprints.map((footprint) => (
                  <span
                    key={footprint.id}
                    aria-hidden="true"
                    className="hover-footprint"
                    style={{ left: footprint.x, top: footprint.y }}
                  />
                ))}
                <span
                  aria-hidden="true"
                  className={cn(
                    "hover-cursor-head",
                    demoCursor.active && "is-active",
                  )}
                  style={{ left: demoCursor.x, top: demoCursor.y }}
                />

                <div className="relative z-10">
                  <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">
                    USDC
                  </p>
                  <p className="hover-value mt-3 text-5xl font-semibold tracking-tight">
                    ${counter.toFixed(6)}
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2 text-sm">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        streaming
                          ? "animate-pulse bg-primary"
                          : "bg-muted-foreground",
                      )}
                    />
                    <span>{streaming ? "Attention verified" : "Idle"}</span>
                    {streaming ? (
                      <Badge className="hover-stream-badge">STREAMING</Badge>
                    ) : null}
                  </div>
                  <p className="mt-6 max-w-xs text-sm text-muted-foreground">
                    Hover the counter above — watch USDC stream in real time
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <section
          className="rounded-[32px] border border-border/70 bg-card/70 p-6"
          id="how-it-works"
        >
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Protocol Loop
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Three actors. One settlement layer.
          </h2>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            VISTA replaces the opaque ad-tech stack with a transparent oracle
            loop. Every dollar is traceable. Every second is provable.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card className="bg-muted/35">
              <CardContent className="space-y-3 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                  01
                </p>
                <h3 className="text-lg font-semibold tracking-tight">
                  Advertiser deposits
                </h3>
                <p className="text-sm text-muted-foreground">
                  Fund a campaign with mUSDC on Base Sepolia. Set your CPSv rate
                  — cost per verified second. Budget only drains when attention
                  is provably real.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-muted/35">
              <CardContent className="space-y-3 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                  02
                </p>
                <h3 className="text-lg font-semibold tracking-tight">
                  Oracle verifies attention
                </h3>
                <p className="text-sm text-muted-foreground">
                  Every 10 seconds, the VISTA Oracle ticks — on-chain proof that
                  a real human is watching. Fake traffic doesn&apos;t earn.
                  Period.
                </p>
              </CardContent>
            </Card>
            <Card className="bg-muted/35">
              <CardContent className="space-y-3 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                  03
                </p>
                <h3 className="text-lg font-semibold tracking-tight">
                  USDC streams live
                </h3>
                <p className="text-sm text-muted-foreground">
                  50% publisher · 30% viewer · 10% validators · 10% protocol.
                  Streamed to wallets in real time. Session ends — NFT receipt
                  minted automatically.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section
          className="rounded-[32px] border border-border/70 bg-card/70 p-6"
          id="roles"
        >
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Choose Your Role
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">
            Same protocol. Three ways to win.
          </h2>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Connect your wallet once. VISTA routes you to onboarding or directly
            into your dashboard.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {(["advertiser", "publisher", "user", "oracle"] as RoleName[]).map((role) => (
              <Button
                key={role}
                variant={activeRole === role ? "default" : "outline"}
                onClick={() => {
                  setActiveRole(role);
                  setImageLoaded(false);
                }}
              >
                {roleCards[role].tab}
              </Button>
            ))}
          </div>

          <Card className="p-2 mt-6 overflow-hidden rounded-[24px] border-border/70 bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.55))] dark:bg-[linear-gradient(180deg,transparent,rgba(18,24,30,0.72))]">
            <div className="grid h-full md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr]">
              <div className="relative min-h-[280px] rounded-[20px] overflow-hidden border-b border-border/70 bg-background/50 md:min-h-full">
                <Image
                  src={roleCards[activeRole].icon}
                  alt={`${roleCards[activeRole].tab} illustration`}
                  fill
                  sizes="280px"
                  className="object-cover"
                  priority
                  onLoad={() => setImageLoaded(true)}
                />
                {!imageLoaded && (
                  <Skeleton className="absolute inset-0 z-10 rounded-none" />
                )}
              </div>
              <div className="flex flex-col md:mt-0 mt-4">
                <CardHeader>
                  <div className="space-y-3">
                    <Badge variant="outline">
                      {roleCards[activeRole].badge}
                    </Badge>
                    <CardTitle className="text-2xl">
                      {roleCards[activeRole].title}
                    </CardTitle>
                    <CardDescription className="text-base">
                      {roleCards[activeRole].sub}
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {roleCards[activeRole].metrics.map((metric) => (
                      <div
                        key={metric.label}
                        className="rounded-xl border border-border/70 bg-background/75 p-3"
                      >
                        <p className="text-base font-semibold tracking-tight">
                          {metric.value}
                        </p>
                        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {metric.label}
                        </p>
                      </div>
                    ))}
                  </div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    {roleCards[activeRole].bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <span className="mt-2 size-1.5 rounded-full bg-primary" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    disabled={pendingRole === activeRole}
                    onClick={() => handleEnterRole(activeRole)}
                  >
                    {pendingRole === activeRole
                      ? "Checking access..."
                      : roleCards[activeRole].cta}
                    <ArrowRight className="size-4" />
                  </Button>
                </CardContent>
              </div>
            </div>
          </Card>
        </section>

        <section
          className="grid gap-4 rounded-[32px] border border-border/70 bg-card/70 p-6 lg:grid-cols-2"
          id="docs"
        >
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
              Why Trust It
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">
              Built for verification, not promises.
            </h2>
            <p className="mt-3 max-w-2xl text-muted-foreground">
              The $600B ad industry runs on self-reported metrics, click fraud,
              and zero-accountability middlemen. VISTA puts every tick, every
              second, every cent on-chain — immutable and auditable by anyone.
            </p>
            <div className="mt-5 space-y-2 text-sm">
              <p>
                <span className="font-semibold">Base Sepolia</span>{" "}
                <span className="text-muted-foreground">
                  EVM-compatible, mobile-first blockchain
                </span>
              </p>
              <p>
                <span className="font-semibold">Supabase Realtime</span>{" "}
                <span className="text-muted-foreground">
                  WebSocket-driven live counters
                </span>
              </p>
              <p>
                <span className="font-semibold">RainbowKit</span>{" "}
                <span className="text-muted-foreground">
                  Wallet-first, no accounts
                </span>
              </p>
              <p>
                <span className="font-semibold">Oracle Architecture</span>{" "}
                <span className="text-muted-foreground">
                  Attention proof every 10 seconds
                </span>
              </p>
            </div>
          </div>
          <Card className="bg-muted/35">
            <CardHeader>
              <CardTitle>Live transaction feed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="flex items-center justify-between">
                <span>Oracle tick confirmed</span>
                <span className="text-muted-foreground">0.0s ago</span>
              </p>
              <p className="flex items-center justify-between">
                <span>USDC stream: +$0.000074</span>
                <span className="text-muted-foreground">10.0s ago</span>
              </p>
              <p className="flex items-center justify-between">
                <span>Session verified: 30s</span>
                <span className="text-muted-foreground">30.0s ago</span>
              </p>
              <p className="flex items-center justify-between">
                <span>Receipt NFT minted</span>
                <span className="text-muted-foreground">31.2s ago</span>
              </p>
              <p className="flex items-center justify-between">
                <span>Budget updated on-chain</span>
                <span className="text-muted-foreground">31.5s ago</span>
              </p>
            </CardContent>
          </Card>
        </section>

        <section className="rounded-[32px] border border-border/70 bg-card/80 p-7 text-center sm:p-10">
          <h2 className="text-3xl font-semibold tracking-tight">
            Attention is the most valuable thing on the internet.
          </h2>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-primary">
            You should own yours.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            No sign-up. No email. No KYC. Connect a wallet and start earning in
            under 60 seconds.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={() => handleEnterRole("user")}>
              Connect Wallet & Start
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex flex-row items-center gap-2"
            >
              <Link
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="flex flex-row items-center gap-2"
              >
                View on GitHub
                <ExternalLink className="size-4" />
              </Link>
            </Button>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 rounded-[28px] border border-border/70 bg-background/70 px-5 py-4 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-3">
            <div className="relative size-8 overflow-hidden rounded-lg border border-border/70 bg-background shadow-sm">
              <Image
                src="/logo/vista.png"
                alt="VISTA Logo"
                fill
                className="object-contain p-1"
              />
            </div>
            <div className="flex flex-col gap-0 sm:flex-row sm:items-center sm:gap-2">
              <span className="font-semibold text-foreground">
                VISTA Protocol
              </span>
              <span className="hidden opacity-40 sm:inline">·</span>
              <span className="text-xs opacity-70">
                Base Sepolia · Not financial advice · Open source
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link
              className="transition-colors hover:text-foreground"
              href="#docs"
            >
              Docs
            </Link>
            <Link
              className="transition-colors hover:text-foreground"
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </Link>
            <Link
              className="transition-colors hover:text-foreground"
              href="https://twitter.com"
              target="_blank"
              rel="noreferrer"
            >
              Twitter
            </Link>
          </div>
        </footer>
      </div>
      <style jsx>{`
        .vista-marquee {
          animation: vista-marquee 26s linear infinite;
        }

        .hover-stage {
          cursor: none;
          overflow: hidden;
          transition:
            border-color 200ms ease,
            box-shadow 200ms ease,
            background-color 200ms ease;
        }

        .hover-stage:hover {
          border-color: color-mix(in oklch, var(--primary) 45%, var(--border));
          box-shadow: inset 0 0 0 1px
            color-mix(in oklch, var(--primary) 20%, transparent);
        }

        .hover-cursor-head {
          position: absolute;
          width: 16px;
          height: 16px;
          border-radius: 999px;
          background: color-mix(in oklch, var(--primary) 80%, white);
          transform: translate(-50%, -50%) scale(0.8);
          opacity: 0;
          pointer-events: none;
          z-index: 2;
          transition: transform 120ms ease;
        }

        .hover-cursor-head.is-active {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
        }

        .hover-footprint {
          position: absolute;
          width: 14px;
          height: 14px;
          border-radius: 999px;
          background: color-mix(in oklch, var(--primary) 50%, transparent);
          border: 1px solid color-mix(in oklch, var(--primary) 70%, white);
          transform: translate(-50%, -50%) scale(0.7);
          opacity: 0.75;
          pointer-events: none;
          animation: footprintFade 680ms ease-out forwards;
        }

        .hover-stage:hover .hover-value {
          animation: valueFloat 900ms ease-in-out infinite alternate;
        }

        .hover-stage:hover .hover-stream-badge {
          animation: badgePop 500ms ease-out;
        }

        @keyframes valueFloat {
          from {
            transform: translateY(0px);
          }

          to {
            transform: translateY(-4px);
          }
        }

        @keyframes badgePop {
          0% {
            transform: scale(0.95);
            opacity: 0.3;
          }

          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes footprintFade {
          0% {
            transform: translate(-50%, -50%) scale(0.7);
            opacity: 0.85;
          }

          100% {
            transform: translate(-50%, -50%) scale(2.1);
            opacity: 0;
          }
        }

        @keyframes vista-marquee {
          0% {
            transform: translateX(0%);
          }

          100% {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </main>
  );
}
