import type { SupabaseClient } from "@supabase/supabase-js";
import { stripUrlsFromFacebookCaption } from "@/lib/facebook/caption";
import {
  facebookSharerUrl,
  humanizeFacebookGraphError,
} from "@/lib/facebook/config";
import {
  loadFacebookPageCredentials,
  markFacebookConnectionMeta,
} from "@/lib/facebook/connection";

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
      error: humanizeFacebookGraphError(
        body?.error?.error_user_msg ||
          body?.error?.message ||
          `Facebook Graph ${res.status}`,
      ),
    };
  }
  return { id: body.post_id || body.id };
}

async function markShareError(
  supabase: SupabaseClient,
  userId: string,
  message: string,
) {
  await markFacebookConnectionMeta(supabase, userId, { lastError: message });
}

async function markShareOk(supabase: SupabaseClient, userId: string) {
  await markFacebookConnectionMeta(supabase, userId, {
    lastError: null,
    lastShareAt: new Date().toISOString(),
  });
}

/**
 * Share an affiliate / smart link to Facebook.
 * When Page is connected → Graph API only (never open sharer dialog).
 * When not connected → return sharer URL for manual share.
 *
 * Prefer a link card (tap → product). Never dump the raw URL into the
 * caption/title text — that looked spammy and hid the product card.
 */
export async function shareAffiliateToFacebook(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    url: string;
    message?: string;
    /** Product image for the link preview card */
    imageUrl?: string | null;
    /** Short product name on the link card */
    title?: string | null;
    /** Price / one-line blurb under the card title */
    description?: string | null;
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
    stripUrlsFromFacebookCaption(opts.message || "") ||
    "Oferta verificada · tocá la tarjeta para comprar";
  const imageUrl = String(opts.imageUrl || "").trim();
  const name = String(opts.title || "").trim().slice(0, 100) || undefined;
  const description =
    String(opts.description || "").trim().slice(0, 200) || undefined;

  try {
    // Link card: caption text + tappable preview (NO raw URL in the text)
    const feedPayload: Record<string, unknown> = {
      message,
      link: destination,
    };
    if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
      feedPayload.picture = imageUrl;
    }
    if (name) feedPayload.name = name;
    if (description) feedPayload.description = description;

    const feed = await graphPost(
      creds.pageId,
      creds.accessToken,
      "feed",
      feedPayload,
    );

    if (feed.id) {
      await markShareOk(supabase, opts.userId);
      return {
        ok: true,
        mode: "page_post",
        postId: feed.id,
        postUrl: postUrlFromId(feed.id),
      };
    }

    // Never publish a photo-only post (no product click)
    const err = humanizeFacebookGraphError(
      feed.error ||
        "No se pudo publicar el link en la Page. Revisá que el token sea de Page (no User) y tenga pages_manage_posts + pages_read_engagement.",
    );
    await markShareError(supabase, opts.userId, err);
    return { ok: false, error: err };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Facebook share failed";
    await markShareError(supabase, opts.userId, msg);
    return { ok: false, error: msg };
  }
}
