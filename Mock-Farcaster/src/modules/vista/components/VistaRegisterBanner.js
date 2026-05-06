"use client";
import { Vista } from "@/lib/vista-sdk";

export function VistaRegisterBanner({ userWallet }) {
  const handleRegisterClick = () => {
    const dashboardUrl =
      process.env.NEXT_PUBLIC_VISTA_DASHBOARD_URL || "http://localhost:3031";
    Vista.showOnboardingModal({ dashboardUrl, wallet: userWallet });
  };

  return (
    <div className="mx-4 my-4 p-4 rounded-xl border border-green-500/30 bg-green-500/5 flex items-center justify-between">
      <div>
        <p className="text-sm font-semibold text-green-400">
          ✦ Earn USDC while you scroll
        </p>
        <p className="text-xs text-zinc-400 mt-0.5">
          Register on VISTA Dashboard to start earning from ads
        </p>
      </div>
      <button
        type="button"
        onClick={handleRegisterClick}
        className="text-xs bg-green-500 hover:bg-green-600 text-black font-semibold px-3 py-1.5 rounded-full transition-colors whitespace-nowrap cursor-pointer"
      >
        Register →
      </button>
    </div>
  );
}
