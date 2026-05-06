"use client";
import { useEffect, useRef, useState } from "react";
import { Vista } from "@/lib/vista-sdk";
import { ExternalLink, Maximize2 } from "lucide-react";

export function VistaAdCard({ campaign, userWallet, onEarn }) {
  const adRef = useRef(null);
  const videoRef = useRef(null);
  const imgRef = useRef(null);
  const mediaWrapperRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const adId = `ad-${campaign.campaign_id_onchain}`;

  const isVideo =
    campaign.media_type === "video" ||
    campaign.creative_url?.match(/\.(mp4|webm|mov)(\?|$)/i);

  useEffect(() => {
    if (!adRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const visible = entry.intersectionRatio >= 0.25;
        setIsVisible(visible);

        if (visible && !isTracking) {
          startTracking();
        } else if (!visible && isTracking) {
          stopTracking();
        }
      },
      { threshold: 0.25 },
    );

    observer.observe(adRef.current);
    return () => observer.disconnect();
  }, [isTracking]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (isVisible) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isVisible]);

  useEffect(() => {
    const handler = () => {
      const fsEl = document.fullscreenElement;
      const wrapper = mediaWrapperRef.current;
      setIsFullscreen(
        !!(fsEl && wrapper && (fsEl === wrapper || wrapper.contains(fsEl))),
      );
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const handleExpandClick = async () => {
    const container = mediaWrapperRef.current;
    if (!container) return;
    try {
      await container.requestFullscreen();
    } catch (err) {
      console.warn("[VISTA] requestFullscreen failed:", err);
    }
  };

  const startTracking = () => {
    try {
      Vista.init({
        apiKey: process.env.NEXT_PUBLIC_VISTA_API_KEY,
        userWallet,
        oracleUrl: process.env.NEXT_PUBLIC_VISTA_ORACLE_URL,
        campaignId: campaign.campaign_id_onchain,
        publisherWallet: process.env.NEXT_PUBLIC_VISTA_PUBLISHER_WALLET,
      });
      Vista.attachZone(adId);
      Vista.onEarn((data) => {
        if (onEarn) onEarn(data);
      });
      Vista.showEarningOverlay({
        campaignTitle: campaign.title,
        targetElement: adRef.current,
      });
      setIsTracking(true);
      console.log("[VISTA] Tracking started for:", campaign.title);
    } catch (err) {
      console.error("[VISTA] Failed to start tracking:", err);
    }
  };

  const stopTracking = () => {
    try {
      Vista.detachZone();
      setIsTracking(false);
      console.log("[VISTA] Tracking stopped for:", campaign.title);
    } catch (err) {
      console.error("[VISTA] Failed to stop tracking:", err);
    }
  };

  useEffect(() => {
    return () => {
      if (isTracking) {
        Vista.detachZone();
      }
    };
  }, [isTracking]);

  return (
    <article
      ref={adRef}
      id={adId}
      className="border-b border-white/10 px-5 py-4 bg-green-950/10"
    >
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-green-700 text-sm font-bold text-white">
          ✦
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-base text-white">
            <span className="font-semibold">{campaign.title}</span>
            <span className="rounded-full bg-green-600/20 border border-green-500/30 px-2 py-0.5 text-xs text-green-400">
              Sponsored
            </span>
          </p>

          {isTracking && (
            <p className="mt-0.5 text-xs text-green-400 flex items-center gap-1">
              <span className="inline-flex h-2 w-2 rounded-full bg-green-400 animate-pulse" />
              {isFullscreen ? "Attention verified" : "Earning USDC"}
            </p>
          )}

          <p className="mt-2 text-sm text-zinc-300">Watch to earn USDC</p>

          {campaign.creative_url && (
            <div
              ref={mediaWrapperRef}
              className={`mt-4 relative overflow-hidden ${isFullscreen ? "bg-black" : "rounded-2xl border border-green-500/20"}`}
            >
              {isVideo ? (
                <video
                  ref={videoRef}
                  src={campaign.creative_url}
                  className={`w-full object-contain ${isFullscreen ? "h-screen max-h-none" : "max-h-80 object-cover"}`}
                  muted
                  loop
                  playsInline
                  controls={false}
                />
              ) : (
                <img
                  ref={imgRef}
                  src={campaign.creative_url}
                  alt={campaign.title}
                  className={`w-full object-contain ${isFullscreen ? "h-screen max-h-none" : "max-h-80 object-cover"}`}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}

              {!isFullscreen && (
                <button
                  onClick={handleExpandClick}
                  title="Open fullscreen"
                  className="absolute top-2 right-2 flex items-center justify-center rounded-lg bg-black/50 p-1.5 text-white hover:bg-black/70 transition"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="mt-3">
            <a
              href={campaign.target_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full bg-green-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-500 transition"
              onClick={() =>
                console.log("[VISTA] CTA clicked:", campaign.title)
              }
            >
              Learn More <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>

          {isTracking && (
            <div className="mt-3 text-xs text-green-400 bg-green-400/10 border border-green-400/20 rounded-full px-3 py-1 inline-block">
              +USDC
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
