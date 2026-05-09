import { ApiError, assertJwt, jsonError, jsonOk } from "@/lib/api";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const primary = await assertJwt(request);
    const { id } = await params;

    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new ApiError("Invalid link id.", 400);
    }

    const supabase = createServerSupabaseClient();
    if (!supabase) throw new ApiError("Supabase not configured.", 500);

    // Authorization is enforced by combining id + primary_wallet in the
    // delete predicate — a row owned by another user simply won't match.
    const { data, error } = await supabase
      .from("linked_wallets")
      .delete()
      .eq("id", id)
      .eq("primary_wallet", primary)
      .select()
      .single();

    if (error || !data) {
      throw new ApiError("Link not found or not owned by caller.", 404);
    }

    return jsonOk({ ok: true, removed: data });
  } catch (error) {
    return jsonError(error);
  }
}
