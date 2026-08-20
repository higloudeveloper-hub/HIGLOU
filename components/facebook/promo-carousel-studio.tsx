"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { matchListingToShopProduct } from "@/lib/don-baraton/match-promo-listings";
import type { DonBaratonPromoProduct } from "@/lib/don-baraton/facebook-promo";

const MIN = 2;
const COLLECTION_MIN = 3;
const MAX = 10;
const DEFAULT_MESSAGE =
  "Ofertas Don Baratón. Deslizá y tocá Comprar en el que te guste.";
const DEFAULT_COLLECTION_MESSAGE =
  "Pensado para tu casa. Deslizá y descubrí estas ofertas.";
const DEFAULT_COLLECTION_TITLE = "Ofertas Don Baratón";

type PromoFormat = "carousel" | "collection";

type HiglouListing = {
  id: string;
  title: string;
  sku: string;
  status: string;
  coverUrl?: string | null;
  price?: number | null;
};

function Thumb({ url, alt }: { url: string | null | undefined; alt: string }) {
  if (!url) {
    return (
      <div className="grid size-full place-items-center bg-[#f3f3f3] text-[10px] text-[#bbb]">
        No photo
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className="h-full w-full object-contain bg-white p-1" />
  );
}

export function PromoCarouselStudio() {
  const [listings, setListings] = useState<HiglouListing[]>([]);
  const [shop, setShop] = useState<DonBaratonPromoProduct[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DonBaratonPromoProduct[]>([]);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [postUrl, setPostUrl] = useState<string | null>(null);
  const [ownerError, setOwnerError] = useState<string | null>(null);
  const [tab, setTab] = useState<"productos" | "publicar">("productos");
  const [format, setFormat] = useState<PromoFormat>("carousel");
  const [coverProductId, setCoverProductId] = useState<string | null>(null);
  const [collectionTitle, setCollectionTitle] = useState(DEFAULT_COLLECTION_TITLE);

  const selectedIds = useMemo(
    () => new Set(selected.map((item) => item.id)),
    [selected],
  );
  const minNeeded = format === "collection" ? COLLECTION_MIN : MIN;
  const cover =
    selected.find((item) => item.id === coverProductId) ?? selected[0] ?? null;

  const loadCatalog = async (nextQuery = "", skus: string[] = []) => {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (skus.length) params.set("skus", skus.join(","));
    const qs = params.toString();
    const res = await fetch(
      `/api/don-baraton/facebook-promo/catalog${qs ? `?${qs}` : ""}`,
    );
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      products?: DonBaratonPromoProduct[];
    } | null;
    if (res.status === 403) {
      setOwnerError("Facebook promo is only available on the Higlou owner account.");
      return [];
    }
    if (!res.ok || body?.ok === false) {
      throw new Error(body?.error || "Could not load Don Baratón catalog");
    }
    return body?.products ?? [];
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const listingRes = await fetch("/api/products");
        const listingBody = (await listingRes.json().catch(() => null)) as {
          products?: HiglouListing[];
        } | null;
        const nextListings = listingBody?.products ?? [];
        const skus = nextListings
          .map((item) => String(item.sku || "").trim())
          .filter(Boolean);
        const [recent, matched] = await Promise.all([
          loadCatalog(""),
          skus.length > 0 ? loadCatalog("", skus) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        const merged = new Map<string, DonBaratonPromoProduct>();
        for (const product of [...matched, ...recent]) {
          merged.set(product.id, product);
        }
        setListings(nextListings);
        const shopProducts = [...merged.values()];
        setShop(shopProducts);

        const requestedIds = new URLSearchParams(window.location.search)
          .get("ids")
          ?.split(",")
          .map((id) => id.trim())
          .filter(Boolean) ?? [];
        if (requestedIds.length > 0) {
          const picked: DonBaratonPromoProduct[] = [];
          let missing = 0;
          for (const id of requestedIds) {
            const listing = nextListings.find((item) => item.id === id);
            const shopProduct = listing
              ? matchListingToShopProduct(listing.sku, shopProducts)
              : null;
            if (shopProduct) picked.push(shopProduct);
            else missing += 1;
          }
          setSelected(picked.slice(0, MAX));
          if (missing > 0) {
            toast.error(
              `${missing} listing(s) are not on donbaraton.shop yet. Publish them first.`,
            );
          }
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : "Could not load products",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!term) return;
    const handle = window.setTimeout(() => {
      setSearching(true);
      void loadCatalog(term)
        .then((products) => setShop(products))
        .catch((error) =>
          toast.error(error instanceof Error ? error.message : "Search failed"),
        )
        .finally(() => setSearching(false));
    }, 280);
    return () => window.clearTimeout(handle);
  }, [query]);

  const listingCards = useMemo(() => {
    const requested = new Set(
      (typeof window === "undefined"
        ? ""
        : new URLSearchParams(window.location.search).get("ids") || ""
      )
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );
    return listings
      .map((listing) => {
        const shopProduct = matchListingToShopProduct(listing.sku, shop);
        return { listing, shopProduct };
      })
      .sort((a, b) => {
        const aHit = requested.has(a.listing.id) ? 0 : 1;
        const bHit = requested.has(b.listing.id) ? 0 : 1;
        return aHit - bHit;
      });
  }, [listings, shop]);

  const toggleShopProduct = (product: DonBaratonPromoProduct) => {
    setPostUrl(null);
    setSelected((current) => {
      if (current.some((item) => item.id === product.id)) {
        const next = current.filter((item) => item.id !== product.id);
        if (coverProductId === product.id) {
          setCoverProductId(next[0]?.id ?? null);
        }
        return next;
      }
      if (current.length >= MAX) {
        toast.error(`Facebook allows ${MAX} products per post.`);
        return current;
      }
      if (!coverProductId) setCoverProductId(product.id);
      return [...current, product];
    });
  };

  const chooseFormat = (next: PromoFormat) => {
    setFormat(next);
    setMessage((current) => {
      if (next === "collection") {
        return current === DEFAULT_MESSAGE ? DEFAULT_COLLECTION_MESSAGE : current;
      }
      return current === DEFAULT_COLLECTION_MESSAGE ? DEFAULT_MESSAGE : current;
    });
  };

  const publish = async () => {
    if (selected.length < minNeeded) {
      toast.error(`Elegí al menos ${minNeeded} productos.`);
      return;
    }
    setPublishing(true);
    setPostUrl(null);
    try {
      const res = await fetch("/api/don-baraton/facebook-promo/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productIds: selected.map((item) => item.id),
          message,
          format,
          coverProductId: cover?.id,
          collectionTitle:
            format === "collection" ? collectionTitle : undefined,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        postUrl?: string | null;
        postId?: string;
      } | null;
      if (!res.ok || body?.ok === false) {
        throw new Error(body?.error || "Facebook publish failed");
      }
      const url = body?.postUrl || null;
      setPostUrl(url);
      toast.success("Facebook carousel posted. Boost it when you want traffic.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Facebook publish failed");
    } finally {
      setPublishing(false);
    }
  };

  if (ownerError) {
    return (
      <div className="p-6 text-sm text-[#707070]">{ownerError}</div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 border-b border-[#e5e5e5] bg-white px-4 py-2 md:px-5">
        <div
          role="tablist"
          className="grid grid-cols-2 rounded-full border border-[#e5e5e5] bg-[#f7f7f7] p-1"
        >
          {(
            [
              { id: "productos" as const, label: "Productos", hint: "Elegí 2 a 10" },
              { id: "publicar" as const, label: "Publicar", hint: "Vista previa" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "rounded-full px-2 py-2 text-center transition",
                tab === item.id
                  ? "bg-[#1877F2] text-white shadow-sm"
                  : "text-[#707070] hover:text-[#191919]",
              )}
            >
              <span className="block text-[13px] font-semibold">{item.label}</span>
              <span
                className={cn(
                  "mt-0.5 hidden text-[11px] sm:block",
                  tab === item.id ? "text-white/80" : "text-[#9b9b9b]",
                )}
              >
                {item.hint}
              </span>
            </button>
          ))}
        </div>
      </div>

    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div
        className={cn(
          "min-h-0 overflow-y-auto bg-[#f7f7f7] p-4 md:p-5",
          tab !== "productos" && "max-lg:hidden",
        )}
      >
        <div className="mb-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => chooseFormat("carousel")}
            className={cn(
              "rounded-2xl border px-3 py-3 text-left",
              format === "carousel"
                ? "border-[#191919] bg-white ring-2 ring-[#191919]"
                : "border-[#e5e5e5] bg-white",
            )}
          >
            <span className="block text-[13px] font-semibold text-[#191919]">
              Carrusel
            </span>
            <span className="mt-1 block text-[12px] leading-snug text-[#707070]">
              Cada producto es una tarjeta con Comprar, como Alibaba.
            </span>
          </button>
          <button
            type="button"
            onClick={() => chooseFormat("collection")}
            className={cn(
              "rounded-2xl border px-3 py-3 text-left",
              format === "collection"
                ? "border-[#191919] bg-white ring-2 ring-[#191919]"
                : "border-[#e5e5e5] bg-white",
            )}
          >
            <span className="block text-[13px] font-semibold text-[#191919]">
              Vitrina
            </span>
            <span className="mt-1 block text-[12px] leading-snug text-[#707070]">
              Foto grande arriba y los productos en fila, como Burberry.
            </span>
          </button>
        </div>
        <p className="mb-4 max-w-2xl text-[13px] leading-relaxed text-[#707070]">
          Elegí {minNeeded} a {MAX} productos. En vitrina, tocá Portada en el
          que va de foto grande. El texto no lleva URL.
        </p>

        <label className="relative mb-4 block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#9b9b9b]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en la tienda…"
            className="h-10 w-full rounded-full border border-[#ccc] bg-white pr-4 pl-9 text-[13px] text-[#191919] outline-none focus:border-[#3665F3]"
          />
        </label>

        {selected.length > 0 ? (
          <div className="mb-4 rounded-[16px] border border-[#e5e5e5] bg-white p-3">
            <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-[#707070] uppercase">
              Elegidos {selected.length}/{MAX}
            </p>
            <ol className="space-y-2">
              {selected.map((product, index) => (
                <li
                  key={product.id}
                  className="flex items-center gap-2 rounded-xl bg-[#f7f7f7] px-2 py-1.5"
                >
                  <span className="w-5 text-center text-[12px] font-bold text-[#707070]">
                    {index + 1}
                  </span>
                  <div className="size-11 overflow-hidden rounded-lg bg-white">
                    <Thumb url={product.imageUrl} alt={product.name} />
                  </div>
                  <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#191919]">
                    {product.name}
                  </p>
                  {format === "collection" ? (
                    <button
                      type="button"
                      onClick={() => setCoverProductId(product.id)}
                      className={cn(
                        "shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold",
                        cover?.id === product.id
                          ? "bg-[#191919] text-white"
                          : "bg-white text-[#707070]",
                      )}
                    >
                      Portada
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="rounded p-1 text-[#9b9b9b] hover:text-[#191919]"
                    onClick={() => toggleShopProduct(product)}
                    aria-label="Remove"
                  >
                    <X className="size-4" />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <section className="mb-5">
          <h2 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-[#707070] uppercase">
            Tus listings de Higlou
          </h2>
          {loading ? (
            <p className="text-[13px] text-[#707070]">Loading listings…</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {listingCards.map(({ listing, shopProduct }) => {
                const active = shopProduct
                  ? selectedIds.has(shopProduct.id)
                  : false;
                return (
                  <button
                    key={listing.id}
                    type="button"
                    disabled={!shopProduct}
                    onClick={() => shopProduct && toggleShopProduct(shopProduct)}
                    className={cn(
                      "overflow-hidden rounded-[16px] border bg-white text-left transition",
                      shopProduct
                        ? active
                          ? "border-[#191919] ring-2 ring-[#191919]"
                          : "border-[#e5e5e5] hover:border-[#ccc]"
                        : "cursor-not-allowed border-[#eee] opacity-60",
                    )}
                  >
                    <div className="relative aspect-square bg-[#f3f3f3]">
                      <Thumb
                        url={shopProduct?.imageUrl || listing.coverUrl}
                        alt={listing.title}
                      />
                    </div>
                    <div className="p-2.5">
                      <p className="line-clamp-2 min-h-[36px] text-[13px] font-semibold text-[#191919]">
                        {listing.title}
                      </p>
                      <p className="mt-1 text-[11px] text-[#707070]">
                        {shopProduct
                          ? "On donbaraton.shop"
                          : "Publish to Don Baratón first"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-[#707070] uppercase">
            Shop catalog {searching ? "· searching" : ""}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {shop.map((product) => {
              const active = selectedIds.has(product.id);
              return (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => toggleShopProduct(product)}
                  className={cn(
                    "overflow-hidden rounded-[16px] border bg-white text-left",
                    active
                      ? "border-[#191919] ring-2 ring-[#191919]"
                      : "border-[#e5e5e5] hover:border-[#ccc]",
                  )}
                >
                  <div className="relative aspect-square bg-[#f3f3f3]">
                    <Thumb url={product.imageUrl} alt={product.name} />
                    {active ? (
                      <span className="absolute right-2 top-2 rounded-full bg-[#191919] px-2 py-0.5 text-[10px] font-bold text-white">
                        {selected.findIndex((item) => item.id === product.id) + 1}
                      </span>
                    ) : null}
                  </div>
                  <div className="p-2.5">
                    <p className="line-clamp-2 text-[13px] font-semibold text-[#191919]">
                      {product.name}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
        {selected.length >= minNeeded ? (
          <button
            type="button"
            onClick={() => setTab("publicar")}
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-[#1877F2] text-[14px] font-semibold text-white lg:hidden"
          >
            Continuar a publicar ({selected.length})
          </button>
        ) : null}
      </div>

      <aside
        className={cn(
          "flex min-h-0 flex-col border-t border-[#e5e5e5] bg-white p-4 lg:border-t-0 lg:border-l",
          tab !== "publicar" && "max-lg:hidden",
        )}
      >
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[#707070] uppercase">
          {format === "collection"
            ? "Vista previa vitrina"
            : "Vista previa carrusel"}
        </p>
        <div className="mt-3 overflow-hidden rounded-xl border border-[#dadde1] bg-[#f0f2f5]">
          <div className="bg-white px-3 pt-3 pb-3">
            <p className="text-[15px] font-semibold text-[#050505]">Don Baratón</p>
            <p className="text-xs text-[#65676b]">Now · Public</p>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              className="mt-3 w-full resize-none border-0 bg-transparent text-[14px] leading-snug text-[#050505] outline-none"
            />
          </div>
          {format === "collection" ? (
            <div className="bg-white">
              {cover ? (
                <div className="relative aspect-[4/5] bg-[#f4f4f5]">
                  <Thumb url={cover.imageUrl} alt={cover.name} />
                </div>
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center bg-[#f4f4f5] text-[13px] text-[#707070]">
                  Elegí {minNeeded} a {MAX} productos
                </div>
              )}
              <p className="px-3 pt-3 text-[17px] font-semibold text-[#050505]">
                {collectionTitle.trim() || DEFAULT_COLLECTION_TITLE}
              </p>
              <div className="flex gap-2 overflow-x-auto px-3 pb-3 pt-2">
                {selected.map((product) => (
                  <div
                    key={product.id}
                    className="size-[88px] shrink-0 overflow-hidden rounded-xl border border-[#dadde1] bg-white"
                  >
                    <Thumb url={product.imageUrl} alt={product.name} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto bg-white px-2 pb-3">
              {selected.length === 0 ? (
                <div className="flex h-40 w-full items-center justify-center rounded-lg bg-[#f4f4f5] text-[13px] text-[#707070]">
                  Elegí {minNeeded} a {MAX} productos
                </div>
              ) : (
                selected.map((product) => (
                  <article
                    key={product.id}
                    className="w-[200px] shrink-0 overflow-hidden rounded-lg border border-[#dadde1] bg-white"
                  >
                    <div className="relative aspect-square bg-[#f4f4f5]">
                      <Thumb url={product.imageUrl} alt={product.name} />
                    </div>
                    <div className="flex items-center gap-2 border-t border-[#dadde1] px-2 py-2">
                      <p className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                        {product.name}
                      </p>
                      <span className="shrink-0 rounded-md bg-[#e4e6eb] px-2 py-1 text-[12px] font-semibold">
                        Comprar
                      </span>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
        </div>

        {format === "collection" ? (
          <label className="mt-3 block">
            <span className="text-[11px] font-semibold tracking-[0.14em] text-[#707070] uppercase">
              Título de la vitrina
            </span>
            <input
              value={collectionTitle}
              onChange={(event) => setCollectionTitle(event.target.value)}
              placeholder={DEFAULT_COLLECTION_TITLE}
              className="mt-1 h-10 w-full rounded-xl border border-[#e5e5e5] px-3 text-[14px] font-semibold text-[#191919] outline-none focus:border-[#191919]"
            />
          </label>
        ) : null}

        <p className="mt-3 text-[12px] leading-relaxed text-[#707070]">
          After it posts, boost that Facebook post and set the destination to
          donbaraton.shop. Do not put a link in the caption.
        </p>

        {postUrl ? (
          <a
            href={postUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 break-all text-[12px] font-medium text-[#3665F3]"
          >
            Open Facebook post
          </a>
        ) : null}

        <button
          type="button"
          onClick={() => void publish()}
          disabled={publishing || selected.length < minNeeded}
          className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#191919] px-5 text-[14px] font-semibold text-white disabled:opacity-40"
        >
          {publishing ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Publishing…
            </>
          ) : (
            `Publicar ${format === "collection" ? "vitrina" : "carrusel"} (${selected.length})`
          )}
        </button>
      </aside>
    </div>
    </div>
  );
}
