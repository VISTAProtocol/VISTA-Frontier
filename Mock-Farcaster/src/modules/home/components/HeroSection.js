import { Heart, MessageCircle, Repeat2, Share } from "lucide-react";
import { useState, Fragment, useEffect } from "react";
import { VistaAdCard } from "@/modules/vista/components/VistaAdCard";
import { VistaRegisterBanner } from "@/modules/vista/components/VistaRegisterBanner";
import { useActiveCampaigns } from "@/modules/vista/hooks/useActiveCampaigns";
import { useVistaUser } from "@/modules/vista/hooks/useVistaUser";

export default function HeroSection({ posts, ads = [], userWallet }) {
  const { campaigns: vistaCampaigns } = useActiveCampaigns(userWallet);
  useVistaUser(userWallet);
  const [totalEarned, setTotalEarned] = useState(0);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data === "VISTA_ONBOARDING_COMPLETE") {
        window.location.reload();
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const getVistaAdForIndex = (index) => {
    if ((index + 1) % 5 !== 0) return null;
    if (!vistaCampaigns || vistaCampaigns.length === 0) return null;

    const campaignIndex = Math.floor((index + 1) / 10) - 1;
    const campaign = vistaCampaigns[campaignIndex % vistaCampaigns.length];
    return campaign;
  };

  const handleEarn = (data) => {
    setTotalEarned((prev) => prev + (data.tickAmount || 0));
  };

  return (
    <section className="mr-4 border-r border-white/10">
      <div className="sticky top-0 z-20 bg-[#06070a]">
        <div className="flex items-center justify-between px-5 py-4">
          <h1 className="text-3xl font-semibold text-white">Home</h1>
          <button
            type="button"
            className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white"
          >
            Post
          </button>
        </div>

        <div className="grid grid-cols-2 border-b border-white/10">
          <button
            type="button"
            className="border-b-2 border-indigo-600 px-4 py-3 text-sm font-semibold text-white"
          >
            For you
          </button>
          <button
            type="button"
            className="px-4 py-3 text-sm font-semibold text-zinc-500"
          >
            Following
          </button>
        </div>
      </div>

      {/* {isRegistered === false && <VistaRegisterBanner userWallet={userWallet} />} */}

      <div id="vista-content-zone">
        {posts.map((post, i) => (
          <Fragment key={`${post.handle}-${post.timeAgo}-${i}`}>
            <article className="border-b border-white/10 px-5 py-4">
              <div className="flex items-start gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-zinc-700 text-sm font-bold text-white">
                  {post.author.slice(0, 1).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-base text-white">
                    <span className="font-semibold">{post.author}</span>
                    <span className="text-zinc-500">{post.timeAgo}</span>
                  </p>

                  <p className="mt-1 whitespace-pre-line text-[20px] leading-7 text-zinc-200">
                    {post.text}
                  </p>

                  {post.media ? (
                    <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-900">
                      <div className="h-92.5 w-full bg-linear-to-br from-amber-900/70 via-amber-700/70 to-zinc-700/70" />
                    </div>
                  ) : null}

                  <div className="mt-4 flex items-center justify-between text-sm text-zinc-500">
                    <div className="flex flex-row gap-8">
                      <span className="flex items-center gap-1">
                        <Heart className="h-4 w-4" />
                        {post.likes}
                      </span>
                      <span className="flex items-center gap-1">
                        <Repeat2 className="h-4 w-4" />
                        {post.recasts}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageCircle className="h-4 w-4" />
                        {post.replies}
                      </span>
                    </div>
                    <Share className="h-4 w-4" />
                  </div>
                </div>
              </div>
            </article>
            {(() => {
              const ad = getVistaAdForIndex(i);
              return ad ? (
                <VistaAdCard
                  key={`vista-ad-${i}`}
                  campaign={ad}
                  userWallet={userWallet}
                  onEarn={handleEarn}
                />
              ) : null;
            })()}
          </Fragment>
        ))}
      </div>
    </section>
  );
}
