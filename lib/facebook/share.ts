import type { SupabaseClient } from "@supabase/supabase-js";
import { facebookSharerUrl } from "@/lib/facebook/config";
import { loadFacebookPageCredentials } from "@/lib/facebook/connection";

/**
 * Share an affiliate / smart link to Facebook.
 * Prefer Page Graph post when connected; otherwise return sharer dialog URL.
 */
export async function shareAffiliateToFacebook(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    url: string;
    message?: string;
  },
): Promise<
  | {
      ok: true;
      mode: "page_post";
      postId: string;
      postUrl: string | null;
    }
  | {
      ok: true;
      mode: "sharer";
      shareUrl: string;
    }
  | { ok: false; error: string }
> {
  const destination = String(opts.url || "").trim();
  if (!/^https?:\/\//i.test(destination)) {
    return { ok: false, error: "Need an absolute https link to share." };
  }

  const creds = await loadFacebookPageCredentials(supabase, opts.userId);
  if (!creds) {
    return {
      ok: true,
      mode: "sharer",
      shareUrl: facebookSharerUrl(destination),
    };
  }

  const message =
    String(opts.message || "").trim() ||
    "Oferta verificada · compra con este link";

  try {
    const endpoint = new URL(
      `https://graph.facebook.com/v21.0/${creds.pageId}/feed`,
    );
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        link: destination,
        access_token: creds.accessToken,
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      id?: string;
      error?: { message?: string };
    } | null;

    if (!res.ok || !body?.id) {
      await supabase
        .from("facebook_connections")
        .update({
          last_error: body?.error?.message || `Facebook ${res.status}`,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", opts.userId);
      // Soft fallback — still let them share via dialog
      return {
        ok: true,
        mode: "sharer",
        shareUrl: facebookSharerUrl(destination),
      };
    }

    await supabase
      .from("facebook_connections")
      .update({
        last_share_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", opts.userId);

    const postId = body.id;
    const postUrl = postId.includes("_")
      ? `https://www.facebook.com/${postId.replace("_", "/posts/")}`
      : `https://www.facebook.com/${postId}`;

    return { ok: true, mode: "page_post", postId, postUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Facebook share failed",
    };
  }
}
