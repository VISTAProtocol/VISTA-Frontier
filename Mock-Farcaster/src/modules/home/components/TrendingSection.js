"use client";

import { Search } from "lucide-react";
import VistaEarningsPanel from "@/modules/vista/VistaEarningsPanel";
import VistaOnboardingCard from "@/modules/vista/components/VistaOnboardingCard";

export default function TrendingSection({ channels, currentUser }) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-4 mt-4">
      <div className="rounded-xl flex flex-row items-center border border-white/10 bg-[#0b0b0f] p-2.5">
        <Search className="h-6 w-6 text-zinc-400" />
        <input
          className="flex items-center justify-between gap-2 px-3 py-2 w-full text-sm text-zinc-400 focus:outline-none"
          type="text"
          placeholder="Search casts, channels and users"
        ></input>
      </div>

      {/* <div className="rounded-2xl border border-white/10 bg-[#18181d] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-3xl font-semibold text-white">Discover Mini Apps</p>
            <p className="mt-1 text-sm text-zinc-400">View Mini Apps in Action</p>
          </div>
          <button
            type="button"
            className="grid h-fit p-2 place-items-center rounded-full bg-indigo-600 text-sm font-bold text-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-500">
          {links.map((link) => (
            <a key={link} href="#" className="hover:text-zinc-300">
              {link}
            </a>
          ))}
        </div>
      </div> */}

      <div className="rounded-2xl border border-white/10 bg-[#0b0b0f] p-4">
        <p className="mb-3 text-sm font-semibold text-zinc-400">
          Popular channels
        </p>
        <div className="flex flex-wrap gap-2">
          {channels.map((channel) => (
            <button
              type="button"
              key={channel}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10"
            >
              {channel}
            </button>
          ))}
        </div>
      </div>

      {/* <div className="rounded-2xl border border-white/10 bg-[#18181d] p-4"> */}
      {/* <p className="mb-3 text-sm font-semibold text-zinc-300">Wallet</p> */}

      <VistaEarningsPanel userWallet={currentUser?.address} />

      <VistaOnboardingCard />
      {/* </div> */}
    </aside>
  );
}
