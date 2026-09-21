import type { SupabaseClient } from "@supabase/supabase-js";
import { humanizeFacebookGraphError } from "@/lib/facebook/config";
import {
  loadFacebookPageCredentials,
  markFacebookConnectionMeta,
} from "@/lib/facebook/connection";
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

type ChildAttachment = {
  link: string;
  name: string;
  description?: string;
  picture: string;
};

function toChildAttachments(cards: PromoCard[]): ChildAttachment[] {
  return cards
    .filter(
      (c) =>
        /^https?:\/\//i.test(c.linkUrl) && /^https?:\/\//i.test(c.imageUrl),
    )
    .slice(0, 10)
    .map((c) => ({
      link: c.linkUrl,
      name: (c.title || "Oferta").slice(0, 80),
      description: (c.priceLabel || "Oferta verificada · Higlou").slice(0, 120),
      picture: c.imageUrl,
    }));
}

/**
 * Alibaba-style multi-link carousel: each card image opens its own product URL.
 * Uses Graph `child_attachments` (not a photo album).
 */
async function publishLinkCarousel(opts: {
  pageId: string;
  accessToken: string;
  message: string;
  cards: PromoCard[];
}): Promise<{ id?: string; error?: string }> {
  const children = toChildAttachments(opts.cards);
  if (children.length < 2) {
    return { error: "Carrusel Alibaba: necesitás al menos 2 productos con imagen + link." };
  }

  const endpoint = new URL(
    `https://graph.facebook.com/v21.0/${opts.pageId}/feed`,
  );
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: opts.message,
      // Primary link required; each child has its own tappable link
      link: children[0]!.link,
      child_attachments: children,
      access_token: opts.accessToken,
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    id?: string;
    error?: { message?: string; error_user_msg?: string };
  } | null;

  if (!res.ok || !body?.id) {
    return {
      error: humanizeFacebookGraphError(
        body?.error?.error_user_msg ||
          body?.error?.message ||
          `Facebook carousel ${res.status}`,
      ),
    };
  }
  return { id: body.id };
}

/**
 * Single product: link share (tappable card). No raw URL dump in the caption.
 * Facebook scrapes the destination for the preview image when we don't own the domain.
 */
async function publishSingleLinkCard(opts: {
  pageId: string;
  accessToken: string;
  message: string;
  card: PromoCard;
}): Promise<{ id?: string; error?: string }> {
  const endpoint = new URL(
    `https://graph.facebook.com/v21.0/${opts.pageId}/feed`,
  );
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: opts.message,
      link: opts.card.linkUrl,
      access_token: opts.accessToken,
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    id?: string;
    error?: { message?: string; error_user_msg?: string };
  } | null;
  if (!res.ok || !body?.id) {
    return {
      error: humanizeFacebookGraphError(
        body?.error?.error_user_msg ||
          body?.error?.message ||
          `Facebook link ${res.status}`,
      ),
    };
  }
  return { id: body.id };
}

/**
 * Publish Ads / Carrusel / Vitrina to the Page.
 * Carrusel + Vitrina = Alibaba-style child_attachments (tap image → product link).
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
    .filter(
      (c) =>
        c.imageUrl &&
        /^https?:\/\//i.test(c.imageUrl) &&
        c.linkUrl &&
        /^https?:\/\//i.test(c.linkUrl),
    );

  const creds = await loadFacebookPageCredentials(supabase, opts.userId);

  if (opts.format === "ads") {
    const first = cards[0];
    if (!first?.linkUrl) {
      return { ok: false, error: "Elegí al menos un producto con link." };
    }
    if (!creds) {
      return shareAffiliateToFacebook(supabase, {
        userId: opts.userId,
        url: first.linkUrl,
        message: opts.message,
        imageUrl: first.imageUrl,
      });
    }
    const caption =
      String(opts.message || "").trim() ||
      "Oferta verificada · tocá la tarjeta y comprá";
    const posted = await publishSingleLinkCard({
      pageId: creds.pageId,
      accessToken: creds.accessToken,
      message: caption,
      card: first,
    });
    if (!posted.id) {
      // Fallback: photo + caption (still no URL list spam)
      return shareAffiliateToFacebook(supabase, {
        userId: opts.userId,
        url: first.linkUrl,
        message: caption,
        imageUrl: first.imageUrl,
      });
    }
    await markFacebookConnectionMeta(supabase, opts.userId, {
      lastError: null,
      lastShareAt: new Date().toISOString(),
    });
    return {
      ok: true,
      mode: "page_post",
      postId: posted.id,
      postUrl: postUrlFromId(posted.id),
    };
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

  if (!creds) {
    const first = cards[0]!;
    return shareAffiliateToFacebook(supabase, {
      userId: opts.userId,
      url: first.linkUrl || first.imageUrl,
      message: opts.message,
      imageUrl: first.imageUrl,
    });
  }

  // Cover card first for vitrina when provided
  let ordered = [...cards];
  const cover = String(opts.coverImageUrl || "").trim();
  if (opts.format === "vitrina" && cover) {
    const coverCard = ordered.find((c) => c.imageUrl === cover);
    if (coverCard) {
      ordered = [coverCard, ...ordered.filter((c) => c.id !== coverCard.id)];
    }
  }

  const titleBit =
    opts.format === "vitrina" && opts.collectionTitle
      ? `${opts.collectionTitle.trim()} · `
      : "";
  const message =
    `${titleBit}${String(opts.message || "").trim() || "Ofertas verificadas · deslizá y tocá el producto"}`.trim();

  try {
    const posted = await publishLinkCarousel({
      pageId: creds.pageId,
      accessToken: creds.accessToken,
      message,
      cards: ordered,
    });

    if (!posted.id) {
      const err =
        posted.error ||
        "No se pudo publicar el carrusel Alibaba. Revisá links e imágenes https.";
      await markFacebookConnectionMeta(supabase, opts.userId, {
        lastError: err,
      });
      return { ok: false, error: err };
    }

    await markFacebookConnectionMeta(supabase, opts.userId, {
      lastError: null,
      lastShareAt: new Date().toISOString(),
    });

    return {
      ok: true,
      mode: "page_post",
      postId: posted.id,
      postUrl: postUrlFromId(posted.id),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Facebook promo failed",
    };
  }
}
