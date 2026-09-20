import { describe, expect, it } from "vitest";
import { z } from "zod";

/** Mirrors app/api/facebook/promo body rules for Ads / Carrusel / Vitrina. */
const cardSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  imageUrl: z.string().url(),
  linkUrl: z.string().url(),
  priceLabel: z.string().max(40).optional().nullable(),
});

const bodySchema = z
  .object({
    format: z.enum(["ads", "carousel", "vitrina"]),
    message: z.string().max(2000).optional().default(""),
    cards: z.array(cardSchema).min(1).max(10),
    coverImageUrl: z.string().url().optional().nullable(),
    collectionTitle: z.string().max(120).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.format === "carousel" && data.cards.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Carrusel: elegí 2 a 10 productos.",
        path: ["cards"],
      });
    }
    if (data.format === "vitrina" && data.cards.length < 3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vitrina: elegí al menos 3 productos.",
        path: ["cards"],
      });
    }
  });

const sample = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    title: `Item ${i}`,
    imageUrl: `https://cdn.example.com/${i}.jpg`,
    linkUrl: `https://shop.example.com/p/${i}`,
  }));

describe("facebook promo formats", () => {
  it("allows Ads with a single card from any source", () => {
    const parsed = bodySchema.parse({
      format: "ads",
      message: "Oferta",
      cards: sample(1),
    });
    expect(parsed.format).toBe("ads");
    expect(parsed.cards).toHaveLength(1);
  });

  it("rejects Carrusel with fewer than 2 cards", () => {
    const result = bodySchema.safeParse({
      format: "carousel",
      cards: sample(1),
    });
    expect(result.success).toBe(false);
  });

  it("accepts Carrusel with 2–10 cards", () => {
    expect(
      bodySchema.parse({ format: "carousel", cards: sample(2) }).cards,
    ).toHaveLength(2);
    expect(
      bodySchema.parse({ format: "carousel", cards: sample(10) }).cards,
    ).toHaveLength(10);
  });

  it("rejects Vitrina with fewer than 3 cards", () => {
    const result = bodySchema.safeParse({
      format: "vitrina",
      cards: sample(2),
      collectionTitle: "Pack",
    });
    expect(result.success).toBe(false);
  });

  it("accepts Vitrina with cover + title + 3 cards", () => {
    const parsed = bodySchema.parse({
      format: "vitrina",
      message: "Deslizá",
      collectionTitle: "Ofertas Higlou",
      coverImageUrl: "https://cdn.example.com/cover.jpg",
      cards: sample(3),
    });
    expect(parsed.format).toBe("vitrina");
    expect(parsed.collectionTitle).toBe("Ofertas Higlou");
    expect(parsed.coverImageUrl).toContain("cover");
  });
});
