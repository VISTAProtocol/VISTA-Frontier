export async function postToDashboard(
  path: string,
  body: Record<string, unknown>
): Promise<void> {
  try {
    const res = await fetch(`${process.env.DASHBOARD_API_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-oracle-secret": process.env.DASHBOARD_API_SECRET!,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`[Ponder] POST ${path} failed: ${res.status}`);
    } else {
      console.log(`[Ponder] POST ${path} OK`);
    }
  } catch (err) {
    console.error(`[Ponder] POST ${path} error:`, err);
  }
}
