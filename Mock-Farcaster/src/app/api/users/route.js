export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const userWallet = searchParams.get("userWallet");

  if (!userWallet) {
    return Response.json({ error: "Missing userWallet" }, { status: 400 });
  }

  const dashboardUrl =
    process.env.NEXT_PUBLIC_VISTA_DASHBOARD_URL ?? "http://localhost:3031";

  try {
    const res = await fetch(`${dashboardUrl}/api/users/${userWallet}`, {
      cache: "no-store",
    });

    if (!res.ok) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    console.error("[API] Failed to check user:", err);
    return Response.json({ error: "Failed to check user" }, { status: 500 });
  }
}
