import type { SupabaseClient } from "@supabase/supabase-js";
import { stripUrlsFromFacebookCaption } from "@/lib/facebook/caption";
import { humanizeFacebookGraphError } from "@/lib/facebook/config";
import {
  ensureFacebookPageCredentialsForPublish,
  markFacebookConnectionMeta,
} from "@/lib/facebook/connection";
import { enrichPromoCardPrices } from "@/lib/facebook/enrich-promo-prices";
import { ensureFacebookPromoAffiliateTrust } from "@/lib/facebook/ensure-affiliate-trust";
import {
  buildFacebookPromoCopy,
  type PromoFormat as CopyFormat,
} from "@/lib/facebook/promo-copy";
import {
  dedupePromoCards,
  productImageKey,
  productTitleKey,
  type PromoGroupCard,
} from "@/lib/facebook/promo-groups";
import {
  facebookFriendlyPictureUrl,
  shortenFacebookCardTitle,
} from "@/lib/facebook/promo-media";
import {
  isFacebookStableHost,
  rehostPromoImagesForFacebook,
} from "@/lib/facebook/rehost-promo-images";

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
  /** Keepa / coupon off percent (5–90) for card description */
  discountPercent?: number | null;
  /** Amazon / eBay / Walmart / Home Depot */
  sourcePlatform?: string | null;
};

function postUrlFromId(postId: string, pageId?: string | null): string {
  const id = String(postId || "").trim();
  if (!id) return "https://www.facebook.com/";
  if (id.includes("_")) {
    return `https://www.facebook.com/${id.replace("_", "/posts/")}`;
  }
  // Photo / object id without page prefix — still openable
  const page = String(pageId || "").trim();
  if (page && /^\d+$/.test(id)) {
    return `https://www.facebook.com/${page}/posts/${id}`;
  }
  return `https://www.facebook.com/${id}`;
}

type ChildAttachment = {
  link: string;
  name: string;
  description?: string;
  picture: string;
};

function healPromoCard(card: PromoCard): PromoCard {
  const current = String(card.imageUrl || "").trim();
  // Never downgrade a CDN-hosted photo back to Amazon (causes blank FB cards)
  const picture = isFacebookStableHost(current)
    ? current
    : facebookFriendlyPictureUrl(
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

/**
 * Fail-closed uniqueness for carousel/vitrina: never post twin cards
 * that share ASIN, photo fingerprint, title, or link.
 */
export function uniquePromoCardsForPublish(cards: PromoCard[]): PromoCard[] {
  const asGroup: PromoGroupCard[] = cards.map((c, i) => ({
    id: c.id || `card-${i}`,
    title: c.title,
    asin: c.asin,
    imageUrl: c.imageUrl,
    priceLabel: c.priceLabel,
  }));
  const uniqueIds = new Set(dedupePromoCards(asGroup).map((c) => c.id));
  const seenLink = new Set<string>();
  const seenPicture = new Set<string>();
  const seenTitle = new Set<string>();
  const out: PromoCard[] = [];
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i]!;
    const id = c.id || `card-${i}`;
    if (!uniqueIds.has(id)) continue;
    const linkKey = String(c.linkUrl || "")
      .trim()
      .toLowerCase()
      .replace(/\/$/, "");
    if (linkKey && seenLink.has(linkKey)) continue;
    const picKey = productImageKey(c.imageUrl);
    if (picKey && seenPicture.has(picKey)) continue;
    const titleKey = productTitleKey(c.title);
    if (titleKey && seenTitle.has(titleKey)) continue;
    if (linkKey) seenLink.add(linkKey);
    if (picKey) seenPicture.add(picKey);
    if (titleKey) seenTitle.add(titleKey);
    out.push(c);
  }
  return out;
}

function toChildAttachments(
  cards: PromoCard[],
  copy = buildFacebookPromoCopy({ format: "carousel", seed: 0 }),
): ChildAttachment[] {
  const unique = uniquePromoCardsForPublish(cards);
  const seenName = new Set<string>();
  const seenPic = new Set<string>();
  return unique
    .map(healPromoCard)
    .filter(
      (c) =>
        /^https?:\/\//i.test(c.linkUrl) && /^https?:\/\//i.test(c.imageUrl),
    )
    .filter((c) => {
      const nameKey = productTitleKey(c.title);
      const picKey = productImageKey(c.imageUrl);
      if (nameKey && seenName.has(nameKey)) return false;
      if (picKey && seenPic.has(picKey)) return false;
      if (nameKey) seenName.add(nameKey);
      if (picKey) seenPic.add(picKey);
      return true;
    })
    .slice(0, 10)
    .map((c) => ({
      link: c.linkUrl,
      name: copy.cardName(c.title),
      description: copy.cardDescription(
        c.priceLabel,
        c.discountPercent,
        c.sourcePlatform,
      ),
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
    discountPercents: opts.cards.map((c) => c.discountPercent),
    platforms: opts.cards.map((c) => c.sourcePlatform),
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
 * Single product: one photo + link. Never fake a 2-card carousel by
 * duplicating the same child_attachment — that posts twin product cards.
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
    discountPercents: [opts.card.discountPercent],
    platforms: [opts.card.sourcePlatform],
    seed: 1,
  });
  const caption =
    stripUrlsFromFacebookCaption(opts.message) ||
    stripUrlsFromFacebookCaption(copy.message);
  const link = String(opts.card.linkUrl || "").trim();
  if (!/^https?:\/\//i.test(link)) {
    return { error: "El producto no tiene link https para el click." };
  }

  const endpoint = new URL(
    `https://graph.facebook.com/v21.0/${opts.pageId}/feed`,
  );

  const picture = String(opts.card.imageUrl || "").trim();
  const hasPicture = /^https?:\/\//i.test(picture);

  // 1) Photo post with link in caption — one image, never a carousel twin
  if (hasPicture) {
    const photoEndpoint = new URL(
      `https://graph.facebook.com/v21.0/${opts.pageId}/photos`,
    );
    const photo = await fetch(photoEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: picture,
        caption: `${caption}\n\n${link}`,
        published: true,
        access_token: opts.accessToken,
      }),
    });
    const photoBody = (await photo.json().catch(() => null)) as {
      id?: string;
      post_id?: string;
      error?: { message?: string; error_user_msg?: string };
    } | null;
    if (photo.ok && (photoBody?.post_id || photoBody?.id)) {
      return { id: photoBody.post_id || photoBody.id };
    }

    // 2) Link post (OG from /go) — still one card, never duplicated children
    const linkPost = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: caption,
        link,
        access_token: opts.accessToken,
      }),
    });
    const linkBody = (await linkPost.json().catch(() => null)) as {
      id?: string;
      error?: { message?: string; error_user_msg?: string };
    } | null;
    if (linkPost.ok && linkBody?.id) {
      return { id: linkBody.id };
    }

    return {
      error: humanizeFacebookGraphError(
        photoBody?.error?.error_user_msg ||
          photoBody?.error?.message ||
          linkBody?.error?.error_user_msg ||
          linkBody?.error?.message ||
          `Facebook link ${photo.status}`,
      ),
    };
  }

  // 3) No picture — clean link post (OG only; may gray out)
  const primary = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: caption,
      link,
      access_token: opts.accessToken,
    }),
  });
  const primaryBody = (await primary.json().catch(() => null)) as {
    id?: string;
    error?: { message?: string; error_user_msg?: string };
  } | null;
  if (primary.ok && primaryBody?.id) {
    return { id: primaryBody.id };
  }

  return {
    error: humanizeFacebookGraphError(
      primaryBody?.error?.error_user_msg ||
        primaryBody?.error?.message ||
        `Facebook link ${primary.status}`,
    ),
  };
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
  // Never publish the same product twice in one post (ASIN / photo / title)
  const cards = uniquePromoCardsForPublish(trusted.cards);

  const page = await ensureFacebookPageCredentialsForPublish(
    supabase,
    opts.userId,
  );
  if (!page.ok) {
    return { ok: false, error: page.error };
  }
  const creds = page.creds;

  // Multi-card "ads" from studio → real tappable carousel/vitrina (never 1 photo)
  let format: PromoFormat = opts.format;
  if (format === "ads" && cards.length >= 2) {
    format = cards.length >= 3 ? "vitrina" : "carousel";
  }

  if (format === "ads") {
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
          discountPercents: [first.discountPercent],
          platforms: [first.sourcePlatform],
          seed: 2,
        }).message,
      );

    const hosted = await rehostPromoImagesForFacebook([first], opts.userId);
    if (!hosted.ok) {
      await markFacebookConnectionMeta(supabase, opts.userId, {
        lastError: hosted.error,
      });
      return {
        ok: false,
        error:
          hosted.error ||
          "No se pudo preparar la foto para Facebook. Sin imagen real no publicamos (evita el cuadro gris).",
      };
    }
    const card = hosted.cards[0]!;

    // Persist rehosted CDN URL onto the /go smart link so OG scrapes work too
    try {
      const slug = String(card.linkUrl || "").match(
        /\/go\/([a-z0-9_-]+)/i,
      )?.[1];
      if (slug && /^https?:\/\//i.test(card.imageUrl)) {
        await supabase
          .from("smart_links")
          .update({ og_image_url: card.imageUrl })
          .eq("user_id", opts.userId)
          .eq("slug", slug.toLowerCase());
      }
    } catch {
      /* column may not exist yet — photo post still carries the image */
    }

    const posted = await publishSingleLinkCard({
      pageId: creds.pageId,
      accessToken: creds.accessToken,
      message: caption,
      card,
    });
    if (!posted.id) {
      return {
        ok: false,
        error:
          posted.error ||
          "No se pudo publicar el link con click. Revisá el token de la Page.",
      };
    }
    await markFacebookConnectionMeta(supabase, opts.userId, {
      lastError: null,
      lastShareAt: new Date().toISOString(),
    });
    return {
      ok: true,
      mode: "page_post",
      postId: posted.id,
      postUrl: postUrlFromId(posted.id, creds.pageId),
    };
  }

  const min = format === "vitrina" ? 3 : 2;
  if (cards.length < min) {
    const hadDupes = cards.length < trusted.cards.length;
    return {
      ok: false,
      error: hadDupes
        ? format === "vitrina"
          ? `La vitrina necesita ${min} productos distintos. Había repeticiones (mismo ASIN, foto o título) — quedaron ${cards.length}.`
          : `El carrusel necesita ${min} productos distintos. Había repeticiones (mismo ASIN, foto o título) — quedaron ${cards.length}.`
        : format === "vitrina"
          ? "La vitrina necesita al menos 3 productos."
          : "El carrusel necesita al menos 2 productos.",
    };
  }
  if (cards.length > 10) {
    return { ok: false, error: "Máximo 10 productos por promo." };
  }

  // Never fall back to a single-photo share for multi-card formats —
  // that is what published "solo 1 foto" instead of the full vitrina.

  // Re-host every picture on our public CDN so Graph scrapes real photos
  // (Amazon ads-system / P/ASIN stubs often publish as blank cards).
  const hosted = await rehostPromoImagesForFacebook(cards, opts.userId);
  if (!hosted.ok) {
    await markFacebookConnectionMeta(supabase, opts.userId, {
      lastError: hosted.error,
    });
    return { ok: false, error: hosted.error };
  }

  // Re-check uniqueness after rehost (same CDN twin must never ship)
  const hostedUnique = uniquePromoCardsForPublish(
    hosted.cards.map((c) => ({
      ...c,
      // Drop Amazon fallbacks so heal never swaps CDN → Amazon (blank cards)
      imageFallbacks: isFacebookStableHost(c.imageUrl)
        ? [c.imageUrl]
        : c.imageFallbacks,
    })),
  );
  if (hostedUnique.length < min) {
    return {
      ok: false,
      error:
        format === "vitrina"
          ? `La vitrina necesita ${min} productos distintos. Había repeticiones — quedaron ${hostedUnique.length}.`
          : `El carrusel necesita ${min} productos distintos. Había repeticiones — quedaron ${hostedUnique.length}.`,
    };
  }

  // Stamp /go OG images for each card so scrapers also get real photos
  try {
    for (const c of hostedUnique) {
      const slug = String(c.linkUrl || "").match(/\/go\/([a-z0-9_-]+)/i)?.[1];
      if (!slug || !/^https?:\/\//i.test(c.imageUrl)) continue;
      await supabase
        .from("smart_links")
        .update({ og_image_url: c.imageUrl })
        .eq("user_id", opts.userId)
        .eq("slug", slug.toLowerCase());
    }
  } catch {
    /* optional until migration applied */
  }

  // Cover card first for vitrina when provided
  let ordered = [...hostedUnique];
  const cover = String(opts.coverImageUrl || "").trim();
  if (format === "vitrina" && cover) {
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
    format,
    titles: ordered.map((c) => c.title),
    prices: ordered.map((c) => c.priceLabel),
    discountPercents: ordered.map((c) => c.discountPercent),
    platforms: ordered.map((c) => c.sourcePlatform),
    seed: 3,
  });
  // Caption = product name + platform. Never chrome niches.
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
      format,
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
      postUrl: postUrlFromId(posted.id, creds.pageId),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Facebook promo failed",
    };
  }
}
