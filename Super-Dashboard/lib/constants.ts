import type { RoleName } from "@/lib/types";

export const APP_NAME = "VISTA Protocol";
export const APP_TAGLINE =
  "A real-time oracle protocol that turns ad attention into a provable, streaming USDC payout.";

export const BASE_MAINNET = {
  id: 84532,
  name: "Base Sepolia",
  rpcUrl: "https://sepolia.base.org",
  currencySymbol: "ETH",
  explorerUrl: "https://sepolia.basescan.org",
} as const;

export const preferenceOptions = [
  "tech",
  "gaming",
  "fashion",
  "sport",
  "food",
  "healthy",
  "finance",
  "crypto",
  "travel",
  "music",
  "automotive",
  "beauty",
  "education",
  "entertainment",
  "fitness",
  "news",
  "photography",
  "real-estate",
] as const;

export const preferenceLabels: Record<
  (typeof preferenceOptions)[number],
  string
> = {
  tech: "Tech",
  gaming: "Gaming",
  fashion: "Fashion",
  sport: "Sport",
  food: "Food & Drink",
  healthy: "Health & Wellness",
  finance: "Finance",
  crypto: "Crypto & Web3",
  travel: "Travel",
  music: "Music",
  automotive: "Automotive",
  beauty: "Beauty",
  education: "Education",
  entertainment: "Entertainment",
  fitness: "Fitness",
  news: "News & Media",
  photography: "Photography",
  "real-estate": "Real Estate",
};

export const locationOptions = [
  "Jakarta",
  "Bandung",
  "Surabaya",
  "Medan",
  "Bali",
  "Yogyakarta",
  "Semarang",
  "Makassar",
  "Palembang",
  "Bogor",
  "Depok",
  "Tangerang",
  "Singapore",
  "Kuala Lumpur",
  "Bangkok",
  "Manila",
  "Ho Chi Minh City",
  "Tokyo",
  "Seoul",
  "Hong Kong",
  "Shanghai",
  "Mumbai",
  "Dubai",
  "London",
  "New York",
  "Los Angeles",
  "Sydney",
] as const;

export const roleMeta: Record<
  RoleName,
  {
    label: string;
    dashboardPath: string;
    onboardingPath: string;
    description: string;
    accent: string;
  }
> = {
  advertiser: {
    label: "Advertiser",
    dashboardPath: "/advertiser/dashboard",
    onboardingPath: "/advertiser/onboarding",
    description: "Launch attention-based USDC campaigns across Web3 surfaces.",
    accent: "from-primary/20 via-primary/5 to-transparent",
  },
  publisher: {
    label: "Publisher",
    dashboardPath: "/publisher/dashboard",
    onboardingPath: "/publisher/onboarding",
    description:
      "Monetize placements and split verified attention in real time.",
    accent: "from-chart-2/20 via-chart-2/5 to-transparent",
  },
  user: {
    label: "End User",
    dashboardPath: "/user/dashboard",
    onboardingPath: "/user/onboarding",
    description:
      "Earn USDC while your attention is verified and streamed live.",
    accent: "from-chart-3/20 via-chart-3/5 to-transparent",
  },
};

export const roleNavigation: Record<
  RoleName,
  Array<{ label: string; href: string }>
> = {
  advertiser: [
    { label: "Dashboard", href: "/advertiser/dashboard" },
    { label: "Campaigns", href: "/advertiser/campaigns" },
    { label: "Launch", href: "/advertiser/campaigns/new" },
  ],
  publisher: [
    { label: "Dashboard", href: "/publisher/dashboard" },
  ],
  user: [
    { label: "Dashboard", href: "/user/dashboard" },
    { label: "History", href: "/user/history" },
  ],
};
