"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

/// Delay before the "still loading?" reload button is offered. Short enough
/// to rescue users who would otherwise sit on a hung screen; long enough
/// not to flash on a normal sub-second load.
const RELOAD_PROMPT_DELAY_MS = 4_000;

export function LoadingScreen({
  title = "Loading dashboard",
  description = "Pulling the latest protocol state and wallet context.",
  offerReload = false,
}: {
  title?: string;
  description?: string;
  /// When true, show a "Reload page" affordance after a short delay so
  /// users aren't stuck having to manually refresh on a flaky network /
  /// wallet adapter hiccup.
  offerReload?: boolean;
}) {
  const [showReload, setShowReload] = useState(false);

  useEffect(() => {
    if (!offerReload) return;
    const id = window.setTimeout(
      () => setShowReload(true),
      RELOAD_PROMPT_DELAY_MS,
    );
    return () => window.clearTimeout(id);
  }, [offerReload]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="rounded-2xl border border-border/70 bg-card p-4 text-primary shadow-sm">
          <Loader2 className="size-6 animate-spin" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        {showReload ? (
          <button
            onClick={() => {
              if (typeof window !== "undefined") {
                window.location.reload();
              }
            }}
            className="mt-2 inline-flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            type="button"
          >
            <RefreshCw className="size-3.5" />
            Still loading? Reload page
          </button>
        ) : null}
      </div>
    </div>
  );
}
