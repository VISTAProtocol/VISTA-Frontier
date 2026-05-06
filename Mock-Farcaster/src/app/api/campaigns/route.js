export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userWallet = searchParams.get("userWallet");

  if (!userWallet) {
    return Response.json({ campaigns: [] });
  }

  const dashboardUrl =
    process.env.NEXT_PUBLIC_VISTA_DASHBOARD_URL ?? "http://localhost:3031";

  try {
    // Pass zero-address so the dashboard returns ALL active campaigns without
    // applying user-targeting filters. Publisher-side apps should show every
    // active ad — targeting is an advertiser preference for routing, not a
    // hard gate for which viewers see the ad.
    const res = await fetch(
      `${dashboardUrl}/api/campaigns/active?userWallet=0x0000000000000000000000000000000000000000`,
      { cache: "no-store" },
    );

    if (!res.ok) {
      return Response.json({ campaigns: [] });
    }

    const data = await res.json();
    const allCampaigns = Array.isArray(data) ? data : (data.campaigns ?? []);
    
    const currentChain = process.env.NEXT_PUBLIC_VISTA_CHAIN || "base-sepolia";
    const campaigns = allCampaigns.filter(c => c.chain === currentChain);
    
    return Response.json({ campaigns });
  } catch (err) {
    console.error("[API/campaigns] Failed to fetch campaigns:", err);
    return Response.json({ campaigns: [] });
  }
}
