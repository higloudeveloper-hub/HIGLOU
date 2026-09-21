import type { SupabaseClient } from "@supabase/supabase-js";
import { facebookSharerUrl } from "@/lib/facebook/config";
import { loadFacebookPageCredentials } from "@/lib/facebook/connection";

function postUrlFromId(postId: string): string {
  return postId.includes("_")
    ? `https://www.facebook.com/${postId.replace("_", "/posts/")}`
    : `https://www.facebook.com/${postId}`;
}

async function graphPost(
  pageId: string,
  accessToken: string,
  path: "feed" | "photos",
  payload: Record<string, unknown>,
): Promise<{ id?: string; error?: string }> {
  const endpoint = new URL(`https://graph.facebook.com/v21.0/${pageId}/${path}`);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, access_token: accessToken }),
  });
  const body = (await res.json().catch(() => null)) as {
    id?: string;
    post_id?: string;
    error?: { message?: string; code?: number; error_user_msg?: string };
  } | null;
  if (!res.ok || !(body?.id || body?.post_id)) {
    return {
      error:
        body?.error?.error_user_msg ||
        body?.error?.message ||
        `Facebook Graph ${res.status}`,
    };
  }
  return { id: body.post_id || body.id };
}

async function markShareError(
  supabase: SupabaseClient,
  userId: string,
  message: string,
) {
  await supabase
    .from("facebook_connections")
    .update({
      last_error: message,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

async function markShareOk(supabase: SupabaseClient, userId: string) {
  await supabase
    .from("facebook_connections")
    .update({
      last_share_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

/**
 * Share an affiliate / smart link to Facebook.
 * When Page is connected → Graph API only (never open sharer dialog).
 * When not connected → return sharer URL for manual share.
 */
export async function shareAffiliateToFacebook(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    url: string;
    message?: string;
    /** Product image — preferred path (photo + caption) when connected */
    imageUrl?: string | null;
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
  const caption = `${message}\n\n${destination}`.trim();
  const imageUrl = String(opts.imageUrl || "").trim();

  try {
    // Prefer photo post when we have an image (more reliable than bare link posts)
    if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
      const photo = await graphPost(creds.pageId, creds.accessToken, "photos", {
        url: imageUrl,
        caption,
        published: true,
      });
      if (photo.id) {
        await markShareOk(supabase, opts.userId);
        return {
          ok: true,
          mode: "page_post",
          postId: photo.id,
          postUrl: postUrlFromId(photo.id),
        };
      }
      // Fall through to feed if photo upload rejected (e.g. bad image host)
    }

    const feed = await graphPost(creds.pageId, creds.accessToken, "feed", {
      message: caption,
      link: destination,
    });

    if (!feed.id) {
      const err =
        feed.error ||
        "No se pudo publicar en la Page. Revisá que el token sea de Page (no User) y tenga pages_manage_posts.";
      await markShareError(supabase, opts.userId, err);
      // Connected → never soft-open Facebook sharer; surface the Graph error
      return { ok: false, error: err };
    }

    await markShareOk(supabase, opts.userId);
    return {
      ok: true,
      mode: "page_post",
      postId: feed.id,
      postUrl: postUrlFromId(feed.id),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Facebook share failed";
    await markShareError(supabase, opts.userId, msg);
    return { ok: false, error: msg };
  }
}
