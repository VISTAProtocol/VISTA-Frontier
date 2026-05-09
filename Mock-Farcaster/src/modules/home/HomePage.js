"use client";

import { useEffect, useState } from "react";
import HeroSection from "@/modules/home/components/HeroSection";
import NavBar from "@/modules/home/components/NavBar";
import TrendingSection from "@/modules/home/components/TrendingSection";
import WalletIdentityBanner from "@/modules/auth/WalletIdentityBanner";
import {
  CHANNELS,
  FEED_POSTS,
  RIGHT_LINKS,
  SIDEBAR_ITEMS,
} from "@/modules/home/components/constants";
function toWalletUser(address) {
  return {
    displayName: "Wallet User",
    handle: `${address.slice(0, 6)}...${address.slice(-4)}`,
    address,
  };
}

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  // Optional override — when the user picks an EVM wallet from the identity
  // banner, sessions are reported with that EVM address. Oracle-node
  // resolves it back to the Solana primary before settlement.
  const [activeWalletOverride, setActiveWalletOverride] = useState(null);
  const effectiveWallet = activeWalletOverride ?? currentUser?.address;

  useEffect(() => {
    let isActive = true;

    async function loadSession() {
      try {
        const response = await fetch("/api/auth/me", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          if (isActive) setCurrentUser(null);
          return;
        }

        const payload = await response.json();
        const address = payload?.user?.address;

        if (!address || !isActive) return;

        setCurrentUser(toWalletUser(address));
      } catch {
        if (isActive) setCurrentUser(null);
      }
    }

    loadSession();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUser?.address) return;

    fetch(`/api/ads?userWallet=${encodeURIComponent(currentUser.address)}`)
      .then((r) => r.json())
      .then(({ campaigns: fetched }) => setCampaigns(fetched ?? []))
      .catch(() => {});
  }, [currentUser?.address]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setCurrentUser(null);
    setCampaigns([]);
  }

  return (
    <div className="min-h-screen bg-[#06070a] text-zinc-100">
      <main className="mx-auto grid w-full max-w-340 grid-cols-1 px-3 pb-3 lg:grid-cols-[250px_1fr_420px]">
        <NavBar
          items={SIDEBAR_ITEMS}
          isLoggedIn={Boolean(currentUser)}
          walletAddress={currentUser?.address}
          onLogout={handleLogout}
        />

        <section id="discover" className="min-w-0">
          {currentUser?.address ? (
            <WalletIdentityBanner
              solanaPrimary={currentUser.address}
              onActiveWalletChange={setActiveWalletOverride}
            />
          ) : null}
          <HeroSection
            posts={FEED_POSTS}
            ads={campaigns}
            userWallet={currentUser?.address}
            sdkUserWallet={effectiveWallet}
          />
        </section>

        <section className="min-w-0">
          <TrendingSection
            channels={CHANNELS}
            links={RIGHT_LINKS}
            currentUser={currentUser}
          />
        </section>
      </main>
    </div>
  );
}
