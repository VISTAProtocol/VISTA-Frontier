import {
  ExternalLink,
  Heart,
  MessageCircle,
  Repeat2,
  Share,
} from "lucide-react";

export default function AdCard({ campaign }) {
  const advertiserHandle = `${campaign.advertiser_wallet.slice(0, 6)}...${campaign.advertiser_wallet.slice(-4)}`;

  return (
    <article className="border-b border-white/10 px-5 py-4 bg-indigo-950/10">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-indigo-700 text-sm font-bold text-white">
          AD
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-base text-white">
            <span className="font-semibold">{advertiserHandle}</span>
            <span className="rounded-full bg-indigo-600/20 border border-indigo-500/30 px-2 py-0.5 text-xs text-indigo-400">
              Sponsored
            </span>
          </p>

          <p className="mt-1 text-[20px] leading-7 text-zinc-200">
            {campaign.title}
          </p>

          {campaign.creative_url && (
            <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-500/20">
              <img
                src={campaign.creative_url}
                alt={campaign.title}
                className="w-full object-cover max-h-64"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
          )}

          <div className="mt-3">
            <a
              href={campaign.target_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 transition"
            >
              Learn More <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-zinc-600">
            <div className="flex flex-row gap-8">
              <span className="flex items-center gap-1">
                <Heart className="h-4 w-4" />—
              </span>
              <span className="flex items-center gap-1">
                <Repeat2 className="h-4 w-4" />—
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="h-4 w-4" />—
              </span>
            </div>
            <Share className="h-4 w-4" />
          </div>
        </div>
      </div>
    </article>
  );
}
