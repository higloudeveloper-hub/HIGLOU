import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFacebookPageCredentials } from "@/lib/facebook/connection";
import { shareAffiliateToFacebook } from "@/lib/facebook/share";

export type PromoFormat = "ads" | "carousel" | "vitrina";

export type PromoCard = {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  priceLabel?: string | null;
};

function postUrlFromId(postId: string): string {
  return postId.includes("_")
    ? `https://www.facebook.com/${postId.replace("_", "/posts/")}`
    : `https://www.facebook.com/${postId}`;
}

async function uploadUnpublishedPhoto(
  pageId: string,
  accessToken: string,
  imageUrl: string,
  caption?: string,
): Promise<string | null> {
  const endpoint = new URL(`https://graph.facebook.com/v21.0/${pageId}/photos`);
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: imageUrl,
      published: false,
      caption: caption || undefined,
      access_token: accessToken,
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    id?: string;
    error?: { message?: string };
  } | null;
  if (!res.ok || !body?.id) return null;
  return body.id;
}

/**
 * Organic Page multi-photo post (carrusel / vitrina style).
 * True Ads carousel needs Marketing API later — this ships a swipeable photo pack + links.
 */
export async function publishFacebookPromo(
  supabase: SupabaseClient,
  opts: {
    userId: string;
    format: PromoFormat;
    message: string;
    cards: PromoCard[];
    coverImageUrl?: string | null;
    collectionTitle?: string | null;
  },
): Promise<
  | { ok: true; mode: "page_post"; postId: string; postUrl: string | null }
  | { ok: true; mode: "sharer"; shareUrl: string }
  | { ok: false; error: string }
> {
  const cards = opts.cards
    .map((c) => ({
      ...c,
      title: String(c.title || "").trim(),
      imageUrl: String(c.imageUrl || "").trim(),
      linkUrl: String(c.linkUrl || "").trim(),
    }))
    .filter((c) => c.imageUrl && /^https?:\/\//i.test(c.imageUrl));

  if (opts.format === "ads") {
    const first = cards[0];
    if (!first?.linkUrl) {
      return { ok: false, error: "Elegí al menos un producto con link." };
    }
    return shareAffiliateToFacebook(supabase, {
      userId: opts.userId,
      url: first.linkUrl,
      message: opts.message,
    });
  }

  const min = opts.format === "vitrina" ? 3 : 2;
  if (cards.length < min) {
    return {
      ok: false,
      error:
        opts.format === "vitrina"
          ? "La vitrina necesita al menos 3 productos."
          : "El carrusel necesita al menos 2 productos.",
    };
  }
  if (cards.length > 10) {
    return { ok: false, error: "Máximo 10 productos por promo." };
  }

  const creds = await loadFacebookPageCredentials(supabase, opts.userId);
  if (!creds) {
    // Fallback: open sharer on the first link
    const first = cards[0]!;
    return shareAffiliateToFacebook(supabase, {
      userId: opts.userId,
      url: first.linkUrl || first.imageUrl,
      message: opts.message,
    });
  }

  const titleLine =
    opts.format === "vitrina" && opts.collectionTitle
      ? `${opts.collectionTitle.trim()}\n\n`
      : "";

  const catalogLines = cards
    .map((c, i) => {
      const price = c.priceLabel ? ` · ${c.priceLabel}` : "";
      return `${i + 1}. ${c.title}${price}\n${c.linkUrl}`;
    })
    .join("\n\n");

  const message = `${titleLine}${String(opts.message || "").trim()}\n\n${catalogLines}`.trim();

  try {
    const mediaIds: string[] = [];
    const cover = String(opts.coverImageUrl || "").trim();
    if (opts.format === "vitrina" && cover && /^https?:\/\//i.test(cover)) {
      const coverId = await uploadUnpublishedPhoto(
        creds.pageId,
        creds.accessToken,
        cover,
        opts.collectionTitle || "Vitrina",
      );
      if (coverId) mediaIds.push(coverId);
    }

    for (const card of cards) {
      const id = await uploadUnpublishedPhoto(
        creds.pageId,
        creds.accessToken,
        card.imageUrl,
        card.title,
      );
      if (id) mediaIds.push(id);
    }

    if (mediaIds.length < 2) {
      // Fall back to single link post
      return shareAffiliateToFacebook(supabase, {
        userId: opts.userId,
        url: cards[0]!.linkUrl,
        message: opts.message,
      });
    }

    const endpoint = new URL(
      `https://graph.facebook.com/v21.0/${creds.pageId}/feed`,
    );
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        attached_media: mediaIds.map((id) => ({ media_fbid: id })),
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
      return {
        ok: false,
        error:
          body?.error?.message ||
          "No se pudo publicar el carrusel. Revisá el token de la Page.",
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

    return {
      ok: true,
      mode: "page_post",
      postId: body.id,
      postUrl: postUrlFromId(body.id),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Facebook promo failed",
    };
  }
}
