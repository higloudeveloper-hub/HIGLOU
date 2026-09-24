import type { SupabaseClient } from "@supabase/supabase-js";
import { stripUrlsFromFacebookCaption } from "@/lib/facebook/caption";
import { humanizeFacebookGraphError } from "@/lib/facebook/config";
import {
  loadFacebookPageCredentials,
  markFacebookConnectionMeta,
} from "@/lib/facebook/connection";
import { enrichPromoCardPrices } from "@/lib/facebook/enrich-promo-prices";
import { ensureFacebookPromoAffiliateTrust } from "@/lib/facebook/ensure-affiliate-trust";
import {
  buildFacebookPromoCopy,
  type PromoFormat as CopyFormat,
} from "@/lib/facebook/promo-copy";
import {
  facebookFriendlyPictureUrl,
  shortenFacebookCardTitle,
} from "@/lib/facebook/promo-media";
import { rehostPromoImagesForFacebook } from "@/lib/facebook/rehost-promo-images";
import { shareAffiliateToFacebook } from "@/lib/facebook/share";

export type PromoFormat = "ads" | "carousel" | "vitrina";

export type PromoCard = {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string;
  priceLabel?: string | null;
  /** When link is a smart redirect, still stamp Amazon buy box via ASIN */
  asin?: string | null;
  /** Extra image candidates (CDN / Keepa / market) for Facebook scrapers */
  imageFallbacks?: string[] | null;
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

function healPromoCard(card: PromoCard): PromoCard {
  const picture = facebookFriendlyPictureUrl(
    card.imageUrl,
    card.asin,
    card.imageFallbacks || [],
  );
  return {
    ...card,
    title: shortenFacebookCardTitle(card.title, 36),
    imageUrl: picture,
  };
}

function toChildAttachments(
  cards: PromoCard[],
  copy = buildFacebookPromoCopy({ format: "carousel", seed: 0 }),
): ChildAttachment[] {
  return cards
    .map(healPromoCard)
    .filter(
      (c) =>
        /^https?:\/\//i.test(c.linkUrl) && /^https?:\/\//i.test(c.imageUrl),
    )
    .slice(0, 10)
    .map((c) => ({
      link: c.linkUrl,
      name: copy.cardName(c.title),
      description: copy.cardDescription(c.priceLabel),
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
  format?: PromoFormat;
}): Promise<{ id?: string; error?: string }> {
  const copy = buildFacebookPromoCopy({
    format: (opts.format || "carousel") as CopyFormat,
    titles: opts.cards.map((c) => c.title),
    prices: opts.cards.map((c) => c.priceLabel),
    seed: 0,
  });
  const children = toChildAttachments(opts.cards, copy);
  const min = opts.format === "vitrina" ? 3 : 2;
  if (children.length < min) {
    return {
      error:
        opts.format === "vitrina"
          ? `La vitrina necesita ${min} productos con imagen https. Facebook solo aceptó ${children.length} de ${opts.cards.length}. Cambiá las fotos problemáticas.`
          : `El carrusel necesita ${min} productos con imagen + link https (aceptados: ${children.length}/${opts.cards.length}).`,
    };
  }
  // Never silently drop products the user selected
  if (children.length < opts.cards.length) {
    return {
      error: `Solo ${children.length} de ${opts.cards.length} productos tienen imagen/link que Facebook acepta. Sacá los que fallan o cambiá la foto (evitá widgets de Amazon Ads).`,
    };
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
 * Single product: tappable link card. Caption = marketing text only.
 * The product URL is on the card (tap → buy) — never pasted into the title/body.
 */
async function publishSingleLinkCard(opts: {
  pageId: string;
  accessToken: string;
  message: string;
  card: PromoCard;
}): Promise<{ id?: string; error?: string }> {
  const copy = buildFacebookPromoCopy({
    format: "ads",
    titles: [opts.card.title],
    prices: [opts.card.priceLabel],
    seed: 1,
  });
  const caption =
    stripUrlsFromFacebookCaption(opts.message) ||
    stripUrlsFromFacebookCaption(copy.message);
  const name = copy.cardName(opts.card.title);
  const description = copy.cardDescription(opts.card.priceLabel);

  const endpoint = new URL(
    `https://graph.facebook.com/v21.0/${opts.pageId}/feed`,
  );
  const payload: Record<string, unknown> = {
    message: caption,
    link: opts.card.linkUrl,
    access_token: opts.accessToken,
  };
  // Help Facebook show our photo/title instead of a blank Amazon scrape
  if (opts.card.imageUrl && /^https?:\/\//i.test(opts.card.imageUrl)) {
    payload.picture = opts.card.imageUrl;
  }
  if (name) payload.name = name;
  if (description) payload.description = description;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
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
  const rawCards = opts.cards
    .map((c) =>
      healPromoCard({
        ...c,
        title: String(c.title || "").trim(),
        imageUrl: String(c.imageUrl || "").trim(),
        linkUrl: String(c.linkUrl || "").trim(),
        priceLabel: c.priceLabel ?? null,
        asin: c.asin ? String(c.asin).trim().toUpperCase() : null,
      }),
    )
    .filter(
      (c) =>
        c.imageUrl &&
        /^https?:\/\//i.test(c.imageUrl) &&
        c.linkUrl &&
        /^https?:\/\//i.test(c.linkUrl),
    );

  if (rawCards.length < opts.cards.length) {
    const dropped = opts.cards.length - rawCards.length;
    return {
      ok: false,
      error: `${dropped} producto${dropped === 1 ? "" : "s"} sin imagen/link https usable. Arreglá la foto antes de publicar (Facebook no lee widgets de Amazon Ads).`,
    };
  }

  // Live Keepa buy box for Amazon links — never publish arbitrage "sell"
  const priced = await enrichPromoCardPrices(rawCards);

  // Fail closed: every Amazon hop must carry Associate tag= (or /go → tagged)
  const trusted = await ensureFacebookPromoAffiliateTrust(supabase, {
    userId: opts.userId,
    cards: priced,
  });
  if (!trusted.ok) {
    return { ok: false, error: trusted.error };
  }
  const cards = trusted.cards;

  const creds = await loadFacebookPageCredentials(supabase, opts.userId);

  if (opts.format === "ads") {
    const first = cards[0];
    if (!first?.linkUrl) {
      return { ok: false, error: "Elegí al menos un producto con link." };
    }
    const caption =
      stripUrlsFromFacebookCaption(opts.message) ||
      stripUrlsFromFacebookCaption(
        buildFacebookPromoCopy({
          format: "ads",
          titles: [first.title],
          prices: [first.priceLabel],
          seed: 2,
        }).message,
      );

    if (!creds) {
      // Manual sharer — still no URL spam in the prefilled text
      return shareAffiliateToFacebook(supabase, {
        userId: opts.userId,
        url: first.linkUrl,
        message: caption,
        imageUrl: first.imageUrl,
        title: first.title,
        description: first.priceLabel,
      });
    }

    // Prefer a rehosted image so the link card never goes blank
    const hosted = await rehostPromoImagesForFacebook([first], opts.userId);
    const card = hosted.ok ? hosted.cards[0]! : first;

    const posted = await publishSingleLinkCard({
      pageId: creds.pageId,
      accessToken: creds.accessToken,
      message: caption,
      card,
    });
    if (!posted.id) {
      // Same link-card path via share helper (still no URL in caption)
      const fallback = await shareAffiliateToFacebook(supabase, {
        userId: opts.userId,
        url: first.linkUrl,
        message: caption,
        imageUrl: card.imageUrl,
        title: card.title,
        description: card.priceLabel,
      });
      if (!fallback.ok) {
        return {
          ok: false,
          error:
            posted.error ||
            fallback.error ||
            "No se pudo publicar el producto con link.",
        };
      }
      return fallback;
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

  // Never fall back to a single-photo share for multi-card formats —
  // that is what published "solo 1 foto" instead of the full vitrina.
  if (!creds) {
    return {
      ok: false,
      error:
        "Conectá tu Page de Facebook en Settings para publicar vitrinas y carruseles completos. Sin Page, Facebook solo permite un link suelto.",
    };
  }

  // Re-host every picture on our public CDN so Graph scrapes real photos
  // (Amazon ads-system / P/ASIN stubs often publish as blank cards).
  const hosted = await rehostPromoImagesForFacebook(cards, opts.userId);
  if (!hosted.ok) {
    await markFacebookConnectionMeta(supabase, opts.userId, {
      lastError: hosted.error,
    });
    return { ok: false, error: hosted.error };
  }

  // Cover card first for vitrina when provided
  let ordered = [...hosted.cards];
  const cover = String(opts.coverImageUrl || "").trim();
  if (opts.format === "vitrina" && cover) {
    // Match by original cover URL OR already-rehosted card id order
    const coverIdx = cards.findIndex(
      (c) => c.imageUrl === cover || c.id === cover,
    );
    if (coverIdx >= 0) {
      const coverCard = ordered[coverIdx];
      if (coverCard) {
        ordered = [
          coverCard,
          ...ordered.filter((c) => c.id !== coverCard.id),
        ];
      }
    } else {
      const byUrl = ordered.find((c) => c.imageUrl === cover);
      if (byUrl) {
        ordered = [byUrl, ...ordered.filter((c) => c.id !== byUrl.id)];
      }
    }
  }

  const fallbackCopy = buildFacebookPromoCopy({
    format: opts.format,
    titles: ordered.map((c) => c.title),
    prices: ordered.map((c) => c.priceLabel),
    seed: 3,
  });
  // Caption = editorial message only (TOP DEALS…). Never prepend niche
  // like "Android" — that looked spammy and broke the Amazon Deals look.
  // Never include raw product URLs in the text — links live on each card.
  const message =
    stripUrlsFromFacebookCaption(opts.message) ||
    stripUrlsFromFacebookCaption(fallbackCopy.message);

  try {
    const posted = await publishLinkCarousel({
      pageId: creds.pageId,
      accessToken: creds.accessToken,
      message,
      cards: ordered,
      format: opts.format,
    });

    if (!posted.id) {
      const err =
        posted.error ||
        "No se pudo publicar el carrusel completo. Revisá links e imágenes https — no publicamos posts a medias.";
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
