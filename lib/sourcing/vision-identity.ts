import {
  getGoogleVisionClient,
  isGoogleVisionConfigured,
} from "@/lib/google-vision/client";
import { normalizeOcrText } from "@/lib/google-vision/normalize-ocr";

export type VisionProductIdentity = {
  configured: boolean;
  brandHints: string[];
  modelHints: string[];
  ocrText: string;
  webEntities: string[];
  matchingPages: Array<{ url: string; title: string }>;
  similarImageUrls: string[];
  searchPhrases: string[];
  warnings: string[];
};

function uniq(values: string[], max = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = String(raw || "").trim();
    if (!v || v.length < 2) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

const MODEL_RE =
  /\b(?:[A-Z]{1,6}[-_]?\d{2,6}[A-Z0-9-]{0,8}|\d{2,4}-\d{2,4}-\d{2,6})\b/g;

/**
 * Google Vision WEB_DETECTION + LOGO + TEXT on a product photo.
 * Used to find the same SKU cheaper on Alibaba / AliExpress / brand sites.
 */
export async function identifyProductFromImage(opts: {
  imageUrl: string;
  titleHint?: string;
  brandHint?: string;
}): Promise<VisionProductIdentity> {
  const empty: VisionProductIdentity = {
    configured: isGoogleVisionConfigured(),
    brandHints: [],
    modelHints: [],
    ocrText: "",
    webEntities: [],
    matchingPages: [],
    similarImageUrls: [],
    searchPhrases: [],
    warnings: [],
  };

  const imageUrl = String(opts.imageUrl || "").trim();
  if (!/^https?:\/\//i.test(imageUrl)) {
    empty.warnings.push("No product image URL for Vision.");
    return empty;
  }

  const client = getGoogleVisionClient();
  if (!client) {
    empty.warnings.push(
      empty.configured
        ? "Google Vision is disabled."
        : "Google Vision is not configured — using title/brand only.",
    );
    return withFallbackPhrases(empty, opts);
  }

  try {
    const [result] = await client.annotateImage({
      image: { source: { imageUri: imageUrl } },
      features: [
        { type: "WEB_DETECTION", maxResults: 12 },
        { type: "LOGO_DETECTION", maxResults: 5 },
        { type: "TEXT_DETECTION", maxResults: 1 },
      ],
    });

    const web = result.webDetection;
    const logos = (result.logoAnnotations || [])
      .map((l) => String(l.description || "").trim())
      .filter(Boolean);
    const fullText = String(
      result.fullTextAnnotation?.text ||
        result.textAnnotations?.[0]?.description ||
        "",
    ).trim();
    const normalized = normalizeOcrText(fullText);

    const webEntities = (web?.webEntities || [])
      .map((e) => String(e.description || "").trim())
      .filter((d) => d.length >= 2 && d.length <= 80);

    const matchingPages = (web?.pagesWithMatchingImages || [])
      .slice(0, 8)
      .map((p) => ({
        url: String(p.url || ""),
        title: String(p.pageTitle || "").trim(),
      }))
      .filter((p) => /^https?:\/\//i.test(p.url));

    const similarImageUrls = [
      ...(web?.visuallySimilarImages || []).map((i) => String(i.url || "")),
      ...(web?.partialMatchingImages || []).map((i) => String(i.url || "")),
      ...(web?.fullMatchingImages || []).map((i) => String(i.url || "")),
    ]
      .filter((u) => /^https?:\/\//i.test(u))
      .slice(0, 10);

    const modelHints = uniq([
      ...(normalized.match(MODEL_RE) || []),
      ...(fullText.match(MODEL_RE) || []),
    ]);

    const identity: VisionProductIdentity = {
      configured: true,
      brandHints: uniq([
        ...logos,
        opts.brandHint || "",
        ...webEntities.slice(0, 3),
      ]),
      modelHints,
      ocrText: normalized.slice(0, 800),
      webEntities: uniq(webEntities),
      matchingPages,
      similarImageUrls: uniq(similarImageUrls, 10),
      searchPhrases: [],
      warnings: [],
    };
    return withFallbackPhrases(identity, opts);
  } catch (error) {
    empty.warnings.push(
      error instanceof Error
        ? `Vision failed: ${error.message}`
        : "Vision failed.",
    );
    return withFallbackPhrases(empty, opts);
  }
}

function withFallbackPhrases(
  identity: VisionProductIdentity,
  opts: { titleHint?: string; brandHint?: string },
): VisionProductIdentity {
  const title = String(opts.titleHint || "").trim();
  const brand = String(opts.brandHint || identity.brandHints[0] || "").trim();
  const model = identity.modelHints[0] || "";
  const phrases = uniq([
    brand && model ? `${brand} ${model}` : "",
    brand && title
      ? `${brand} ${title
          .split(/\s+/)
          .filter((w) => w.length > 2)
          .slice(0, 5)
          .join(" ")}`
      : "",
    ...identity.webEntities.slice(0, 4),
    title
      .split(/\s+/)
      .filter((w) => w.length > 2)
      .slice(0, 6)
      .join(" "),
    model,
  ]);
  return { ...identity, searchPhrases: phrases.slice(0, 6) };
}
