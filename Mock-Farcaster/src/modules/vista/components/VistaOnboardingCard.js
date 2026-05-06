"use client";

const DASHBOARD_BASE_URL =
  process.env.NEXT_PUBLIC_VISTA_DASHBOARD_URL || "http://localhost:3031";

const ONBOARDING_LINKS = [
  {
    role: "Advertiser",
    tagline: "Reach real, attentive audiences",
    description:
      "Run targeted ad campaigns and only pay when users genuinely engage with your content.",
    href: `${DASHBOARD_BASE_URL}/advertiser/onboarding`,
    accent: "from-violet-500 to-indigo-600",
    badgeColor: "bg-violet-500/15 text-violet-300 border-violet-500/25",
    arrowColor: "text-violet-400",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    role: "Publisher",
    tagline: "Monetise your platform passively",
    description:
      "Integrate VISTA ads into your app or feed and earn USDC every time your users view them.",
    href: `${DASHBOARD_BASE_URL}/publisher/onboarding`,
    accent: "from-emerald-500 to-teal-600",
    badgeColor: "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
    arrowColor: "text-emerald-400",
    icon: (
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    ),
  },
];

export default function VistaOnboardingCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b0b0f] p-4 space-y-3">
      {/* Header */}
      <div className="space-y-0.5">
        <p className="text-sm font-semibold text-zinc-200">Grow with VISTA</p>
        <p className="text-xs text-zinc-500 leading-relaxed">
          Join the attention-based ad network — as an advertiser or a publisher.
        </p>
      </div>

      {/* Cards */}
      <div className="space-y-2">
        {ONBOARDING_LINKS.map(
          ({
            role,
            tagline,
            description,
            href,
            accent,
            badgeColor,
            arrowColor,
            icon,
          }) => (
            <a
              key={role}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col gap-2 rounded-xl border border-white/8 bg-white/3 p-3 transition-all duration-200 hover:border-white/15 hover:bg-white/6"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {/* Role icon */}
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-linear-to-br ${accent} text-white/90`}
                  >
                    {icon}
                  </span>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-zinc-200">
                        {role}
                      </span>
                      <span
                        className={`rounded-full border px-1.5 py-px text-[9px] font-medium uppercase tracking-wide ${badgeColor}`}
                      >
                        Get started
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">
                      {tagline}
                    </p>
                  </div>
                </div>

                {/* Arrow */}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`shrink-0 mt-0.5 transition-transform duration-200 group-hover:translate-x-0.5 ${arrowColor}`}
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>

              <p className="text-[10px] text-zinc-500 leading-relaxed">
                {description}
              </p>
            </a>
          ),
        )}
      </div>

      {/* Footer */}
      <p className="text-center text-[9px] text-zinc-600 tracking-wide uppercase">
        Powered by VISTA · Attention Economy
      </p>
    </div>
  );
}
