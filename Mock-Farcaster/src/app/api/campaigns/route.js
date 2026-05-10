export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userWallet = searchParams.get("userWallet");

  if (!userWallet) {
    return Response.json({ campaigns: [] });
  }

  const dashboardUrl =
    process.env.NEXT_PUBLIC_VISTA_DASHBOARD_URL ?? "http://localhost:3031";

  try {
    // Pass System Program (all-1s base58) as a placeholder so the dashboard
    // returns ALL active campaigns without applying user-targeting filters.
    // Publisher-side apps should show every active ad — targeting is an
    // advertiser preference for routing, not a hard gate for which viewers
    // see the ad.
    const placeholderWallet = "11111111111111111111111111111111";
    const res = await fetch(
      `${dashboardUrl}/api/campaigns/active?userWallet=${placeholderWallet}`,
      { cache: "no-store" },
    );

    if (!res.ok) {
      return Response.json({ campaigns: [] });
    }

    const data = await res.json();
    const campaigns = Array.isArray(data) ? data : (data.campaigns ?? []);

    // No chain filter: cross-chain bridge means any active campaign should be
    // shown to publisher viewers regardless of which chain it originated from.
    // The on-chain settlement path (vista_protocol vs vista_bridge) is picked
    // by the SDK based on each campaign's `chain` / `bridge_status`, not by
    // hiding cross-chain campaigns from the feed.
    return Response.json({ campaigns });
  } catch (err) {
    console.error("[API/campaigns] Failed to fetch campaigns:", err);
    return Response.json({ campaigns: [] });
  }
}
