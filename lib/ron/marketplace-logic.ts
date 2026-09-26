/**
 * Real marketplace decision helpers for RON.
 * Mimics how large retail ops rank deals: discount depth, velocity,
 * mid-ticket convertibility, learning, and US shopping peak windows.
 */

import type { RonLearning } from "@/lib/ron/types";
import { scoreAsin } from "@/lib/ron/learn";

export type MoneyCard = {
  asin?: string | null;
  title?: string | null;
  priceLabel?: string | null;
  discountPercent?: number | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  sourcePlatform?: string | null;
};

export type RonPipelineStage =
  | "idle"
  | "scan"
  | "rank"
  | "pack"
  | "publish"
  | "wait";

export type RonOpsSnapshot = {
  freshAsins: number;
  catalogAsins: number;
  lastMoneyScore: number;
  lastFormat: string | null;
  pipeline: RonPipelineStage;
  peakWindow: boolean;
  moneyHint: string;
  nextAction: string;
};

/** US Eastern hour — Amazon/FB shopping peaks. */
export function usEasternHour(now = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hour12: false,
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    return Number.isFinite(h) ? h % 24 : now.getUTCHours() - 5;
  } catch {
    return (now.getUTCHours() - 5 + 24) % 24;
  }
}

/**
 * Peak windows where affiliate FB traffic converts harder
 * (late morning + evening US).
 */
export function isShoppingPeakWindow(now = new Date()): boolean {
  const h = usEasternHour(now);
  return (h >= 10 && h <= 14) || (h >= 18 && h <= 22);
}

/** Soft gate: off-peak only skip weak solos; packs & force always ok. */
export function shouldHoldForPeak(opts: {
  force?: boolean;
  format: "ads" | "carousel" | "vitrina";
  moneyScore: number;
  now?: Date;
}): boolean {
  if (opts.force) return false;
  if (isShoppingPeakWindow(opts.now)) return false;
  // Strong packs can still ship off-peak
  if (opts.format !== "ads" && opts.moneyScore >= 40) return false;
  // Weak solo ads wait for peak unless exceptional score
  if (opts.format === "ads" && opts.moneyScore < 55) return true;
  return false;
}

/**
 * Money opportunity score for a single card (0–100-ish).
 * Higher = publish first.
 */
export function scoreCardMoneyOpportunity(
  card: MoneyCard,
  learning: RonLearning,
): number {
  const discount = Number(card.discountPercent) || 0;
  const discountPts = discount >= 40 ? 28 : discount >= 25 ? 18 : discount >= 15 ? 10 : 0;

  const priceRaw = String(card.priceLabel || "").replace(/[^0-9.]/g, "");
  const price = Number(priceRaw) || 0;
  // Sweet spot for FB affiliate ($15–$70)
  const pricePts =
    price >= 15 && price <= 70 ? 16 : price > 0 && price < 120 ? 6 : price > 0 ? 2 : 4;

  const clickPts = Math.min(20, (scoreAsin(learning, card.asin) - 1) * 6);
  const platformPts = /amazon/i.test(String(card.sourcePlatform || ""))
    ? 6
    : /walmart|ebay|home/i.test(String(card.sourcePlatform || ""))
      ? 4
      : 2;

  const titleLen = String(card.title || "").trim().length;
  const titlePts = titleLen >= 18 && titleLen <= 70 ? 6 : titleLen > 8 ? 3 : 0;

  const imagePts = /^https?:\/\//i.test(String(card.imageUrl || "")) ? 8 : 0;
  const linkPts = /^https?:\/\//i.test(String(card.linkUrl || "")) ? 10 : 0;

  return Math.round(
    discountPts + pricePts + clickPts + platformPts + titlePts + imagePts + linkPts,
  );
}

export function scorePackMoneyOpportunity(
  cards: MoneyCard[],
  learning: RonLearning,
): number {
  if (!cards.length) return 0;
  const scores = cards.map((c) => scoreCardMoneyOpportunity(c, learning));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  // Bonus for vitrina depth
  const depth = cards.length >= 4 ? 12 : cards.length >= 3 ? 8 : cards.length >= 2 ? 4 : 0;
  return Math.round(avg + depth);
}

export function rankCatalogByMoney(
  catalog: MoneyCard[],
  learning: RonLearning,
): MoneyCard[] {
  return [...catalog].sort(
    (a, b) =>
      scoreCardMoneyOpportunity(b, learning) -
      scoreCardMoneyOpportunity(a, learning),
  );
}

export function derivePipelineFromStatus(
  statusMessage: string,
  working: boolean,
): RonPipelineStage {
  const m = String(statusMessage || "").toLowerCase();
  if (!working && /apagado|listo para encender/i.test(m)) return "idle";
  if (/keepa|escane|scan|modalidad/i.test(m)) return "scan";
  if (/rank|catálogo|catalog|afiliad|oportun/i.test(m)) return "rank";
  if (/pack|vitrina|carrusel|armando/i.test(m)) return "pack";
  if (/public/i.test(m)) return "publish";
  if (working) return "scan";
  return "wait";
}

export function buildMoneyHint(opts: {
  postsToday: number;
  clicksSeen: number;
  freshAsins: number;
  peakWindow: boolean;
}): string {
  if (opts.freshAsins <= 0) {
    return "Esperando Keepa fresco · no hay ASINs nuevos para monetizar";
  }
  if (opts.peakWindow) {
    return `Ventana pico US · ${opts.freshAsins} oportunidades listas · clicks ${opts.clicksSeen}`;
  }
  if (opts.postsToday >= 8) {
    return "Cuota diaria alta · priorizo solo deals fuertes";
  }
  return `${opts.freshAsins} oportunidades en cola · RON elige el mejor ROI`;
}

export function buildNextAction(opts: {
  enabled: boolean;
  working: boolean;
  peakWindow: boolean;
  freshAsins: number;
  lastError: string | null;
}): string {
  if (opts.lastError) {
    if (/page|token|facebook|cifrado|encryption/i.test(opts.lastError)) {
      return "Conectá / renová el Page token en Settings → Facebook";
    }
    return "Revisá el error · luego reencendé el ciclo";
  }
  if (!opts.enabled) return "Encendé RON para que trabaje solo";
  if (opts.working) return "Ciclo en curso · no hace falta tocar nada";
  if (opts.freshAsins <= 0) return "Próximo: escaneo Keepa general automático";
  if (opts.peakWindow) return "Próximo: publicar el pack de mayor score";
  return "Próximo: rankear deals · publicar en ventana pico o si el score es alto";
}

export function emptyOpsSnapshot(): RonOpsSnapshot {
  return {
    freshAsins: 0,
    catalogAsins: 0,
    lastMoneyScore: 0,
    lastFormat: null,
    pipeline: "idle",
    peakWindow: isShoppingPeakWindow(),
    moneyHint: "Encendé RON para generar oportunidades",
    nextAction: "Encendé RON para que trabaje solo",
  };
}
