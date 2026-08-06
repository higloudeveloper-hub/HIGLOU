/**
 * Multi-template eBay description HTML builders.
 * Inline styles only (Seller Hub safe). Store name + colors come from branding.
 */

import type { StoreBranding } from "@/config/store-branding";
import {
  resolveTemplateId,
  type DescriptionTemplateId,
} from "@/config/description-templates";
import type { DescriptionContent } from "@/lib/ebay/description-content";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function listItems(items: string[], emptyFallback: string): string {
  if (!items.length) {
    return `<li style="margin:0 0 8px 0;color:#555555;">${escapeHtml(emptyFallback)}</li>`;
  }
  return items
    .map(
      (item) =>
        `<li style="margin:0 0 8px 0;color:#333333;">${escapeHtml(item)}</li>`,
    )
    .join("");
}

function brandBits(branding: StoreBranding) {
  const storeName = branding.storeName.trim() || "Our Store";
  const storeDisplay =
    branding.storeNameDisplay.trim() || storeName.toUpperCase();
  const slogan = branding.slogan.trim();
  const thankYou =
    branding.thankYouMessage.trim() ||
    `Thank You for Shopping With ${storeName}`;
  const thankYouSub = branding.thankYouSubtext.trim();
  const shipping = branding.shippingInformation.trim();
  const footer =
    branding.footerText.trim() || `Shop with confidence at ${storeName}.`;
  const c = branding.colors;
  return {
    storeName,
    storeDisplay,
    slogan,
    thankYou,
    thankYouSub,
    shipping,
    footer,
    c,
  };
}

function specsRows(content: DescriptionContent): string {
  const rows = (content.specs || [])
    .filter((s) => s.label.trim() && s.value.trim())
    .slice(0, 10);
  if (!rows.length) return "";
  return rows
    .map((spec, i) => {
      const bg = i % 2 === 0 ? "#fafafa" : "#ffffff";
      return `<tr>
        <td style="padding:10px 14px;border-bottom:1px solid #eeeeee;background:${bg};width:36%;font-size:12px;font-weight:700;color:#666666;text-transform:uppercase;letter-spacing:0.5px;">${escapeHtml(spec.label)}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #eeeeee;background:${bg};font-size:14px;color:#111111;font-weight:600;">${escapeHtml(spec.value)}</td>
      </tr>`;
    })
    .join("");
}

function sectionTitle(
  label: string,
  accent: string,
  style: "bar" | "line" | "pill" = "line",
): string {
  if (style === "pill") {
    return `<div style="display:inline-block;background:${accent};color:#111111;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:6px 12px;margin:0 0 12px 0;">${escapeHtml(label)}</div>`;
  }
  if (style === "bar") {
    return `<div style="font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#111111;margin:0 0 12px 0;padding:10px 14px;background:#f4f4f5;border-left:4px solid ${accent};">${escapeHtml(label)}</div>`;
  }
  return `<div style="font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#111111;margin:0 0 10px 0;padding-bottom:6px;border-bottom:2px solid ${accent};display:inline-block;">${escapeHtml(label)}</div>`;
}

function buildClassic(
  content: DescriptionContent,
  branding: StoreBranding,
): string {
  const { storeDisplay, slogan, thankYou, thankYouSub, shipping, c } =
    brandBits(branding);
  const accent = c.accent || "#f4c928";
  const specs = specsRows(content);
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:880px;width:100%;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:${c.bodyText};line-height:1.55;background:#ffffff;border:1px solid ${c.border};">
  <tr><td style="height:5px;line-height:5px;font-size:0;background:${accent};">&nbsp;</td></tr>
  <tr>
    <td style="background:${c.headerBackground};padding:28px 32px;text-align:center;">
      <div style="font-size:28px;font-weight:700;letter-spacing:3px;color:${c.headerText};">${escapeHtml(storeDisplay)}</div>
      <div style="margin:10px auto 0 auto;width:48px;height:3px;background:${accent};"></div>
      ${slogan ? `<div style="font-size:13px;margin-top:12px;color:#cfcfcf;letter-spacing:0.3px;">${escapeHtml(slogan)}</div>` : ""}
    </td>
  </tr>
  <tr>
    <td style="padding:32px 30px 10px 30px;">
      <h1 style="font-size:24px;line-height:1.3;margin:0 0 14px 0;color:#111111;font-weight:700;">${escapeHtml(content.productTitle)}</h1>
      <p style="font-size:15px;margin:0 0 24px 0;color:#444444;">${escapeHtml(content.productIntroduction)}</p>
      ${specs ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:0 0 26px 0;border:1px solid #ececec;"><tr><td colspan="2" style="padding:12px 14px;background:#111111;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Product Details</td></tr>${specs}</table>` : ""}
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:0 0 26px 0;border-collapse:collapse;">
        <tr>
          <td style="width:4px;background:${accent};"></td>
          <td style="background:${c.panelBackground};padding:18px 20px;">
            <div style="font-size:14px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;color:#111111;margin:0 0 10px 0;">Product Highlights</div>
            <ul style="margin:0;padding-left:18px;">${listItems(content.features, "See photos and details for key features.")}</ul>
          </td>
        </tr>
      </table>
      ${sectionTitle("Condition", accent)}
      <p style="font-size:14px;margin:10px 0 22px 0;color:#333333;">${escapeHtml(content.itemCondition || "See condition details in the listing.")}</p>
      ${sectionTitle("What's Included", accent)}
      <ul style="margin:10px 0 22px 0;padding-left:18px;">${listItems(content.packageContents, "See listing photos for package contents.")}</ul>
      ${sectionTitle("Shipping & Service", accent)}
      <p style="font-size:14px;margin:10px 0 8px 0;color:#333333;">${escapeHtml(shipping || "Packed carefully. Tracking provided when available.")}</p>
      <p style="font-size:13px;margin:0 0 8px 0;color:#777777;">Please review photos carefully — what you see is what you receive.</p>
    </td>
  </tr>
  <tr>
    <td style="padding:0 30px 30px 30px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;">
        <tr><td style="height:3px;line-height:3px;font-size:0;background:${accent};">&nbsp;</td></tr>
        <tr>
          <td style="background:${c.headerBackground};padding:24px 22px;text-align:center;">
            <div style="font-size:18px;font-weight:700;color:${c.headerText};">${escapeHtml(thankYou)}</div>
            ${thankYouSub ? `<div style="font-size:13px;margin-top:8px;color:#d0d0d0;">${escapeHtml(thankYouSub)}</div>` : ""}
            <div style="font-size:12px;margin-top:12px;color:${accent};letter-spacing:1px;text-transform:uppercase;">${escapeHtml(storeDisplay)}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function buildModern(
  content: DescriptionContent,
  branding: StoreBranding,
): string {
  const { storeDisplay, slogan, thankYou, thankYouSub, shipping, footer, c } =
    brandBits(branding);
  const accent = c.accent || "#2563eb";
  const specs = specsRows(content);
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:860px;width:100%;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:${c.bodyText};line-height:1.6;background:#ffffff;">
  <tr>
    <td style="padding:0;background:${c.headerBackground};">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr><td style="height:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr>
          <td style="padding:26px 28px;">
            <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${accent};font-weight:700;margin:0 0 8px 0;">${escapeHtml(storeDisplay)}</div>
            ${slogan ? `<div style="font-size:13px;color:#94a3b8;margin:0;">${escapeHtml(slogan)}</div>` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 28px 8px 28px;">
      <h1 style="font-size:26px;line-height:1.25;margin:0 0 12px 0;font-weight:800;color:${c.bodyText};">${escapeHtml(content.productTitle)}</h1>
      <p style="font-size:15px;margin:0 0 22px 0;color:#475569;">${escapeHtml(content.productIntroduction)}</p>
      ${specs ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:0 0 22px 0;border:1px solid ${c.border};">${specs}</table>` : ""}
      ${sectionTitle("Highlights", accent, "bar")}
      <ul style="margin:0 0 22px 0;padding-left:18px;">${listItems(content.features, "See photos and details for key features.")}</ul>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:0 0 18px 0;">
        <tr>
          <td width="50%" valign="top" style="padding:0 10px 0 0;">
            ${sectionTitle("Condition", accent, "bar")}
            <p style="font-size:14px;margin:0;color:#334155;">${escapeHtml(content.itemCondition || "See listing.")}</p>
          </td>
          <td width="50%" valign="top" style="padding:0 0 0 10px;">
            ${sectionTitle("Included", accent, "bar")}
            <ul style="margin:0;padding-left:18px;">${listItems(content.packageContents, "See listing photos.")}</ul>
          </td>
        </tr>
      </table>
      ${sectionTitle("Shipping", accent, "bar")}
      <p style="font-size:14px;margin:0 0 8px 0;color:#334155;">${escapeHtml(shipping || "Secure packing. Tracking when available.")}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:18px 28px 28px 28px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${c.panelBackground};border:1px solid ${c.border};">
        <tr>
          <td style="padding:20px;text-align:center;">
            <div style="font-size:16px;font-weight:700;color:${c.bodyText};">${escapeHtml(thankYou)}</div>
            ${thankYouSub ? `<div style="font-size:13px;margin-top:6px;color:#64748b;">${escapeHtml(thankYouSub)}</div>` : ""}
            <div style="font-size:12px;margin-top:10px;color:${accent};font-weight:700;">${escapeHtml(footer)}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

function buildEditorial(
  content: DescriptionContent,
  branding: StoreBranding,
): string {
  const { storeDisplay, slogan, thankYou, thankYouSub, shipping, footer, c } =
    brandBits(branding);
  const accent = c.accent || "#b45309";
  const specs = specsRows(content);
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:840px;width:100%;margin:0 auto;font-family:Georgia,'Times New Roman',serif;color:${c.bodyText};line-height:1.65;background:#ffffff;border:1px solid ${c.border};">
  <tr>
    <td style="padding:36px 34px 20px 34px;text-align:center;background:${c.panelBackground};border-bottom:1px solid ${c.border};">
      <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${accent};font-family:Arial,Helvetica,sans-serif;font-weight:700;">${escapeHtml(storeDisplay)}</div>
      ${slogan ? `<div style="font-size:15px;font-style:italic;margin-top:10px;color:#57534e;">${escapeHtml(slogan)}</div>` : ""}
    </td>
  </tr>
  <tr>
    <td style="padding:30px 34px 12px 34px;">
      <h1 style="font-size:28px;line-height:1.3;margin:0 0 16px 0;font-weight:400;color:#1c1917;">${escapeHtml(content.productTitle)}</h1>
      <p style="font-size:16px;margin:0 0 26px 0;color:#44403c;">${escapeHtml(content.productIntroduction)}</p>
      ${sectionTitle("The Details", accent, "pill")}
      ${specs ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:0 0 24px 0;font-family:Arial,Helvetica,sans-serif;">${specs}</table>` : ""}
      <div style="font-family:Arial,Helvetica,sans-serif;">
        ${sectionTitle("Highlights", accent)}
        <ul style="margin:0 0 22px 0;padding-left:18px;">${listItems(content.features, "See photos and details for key features.")}</ul>
        ${sectionTitle("Condition", accent)}
        <p style="font-size:14px;margin:8px 0 20px 0;color:#44403c;">${escapeHtml(content.itemCondition || "See listing.")}</p>
        ${sectionTitle("What's Included", accent)}
        <ul style="margin:8px 0 20px 0;padding-left:18px;">${listItems(content.packageContents, "See listing photos.")}</ul>
        ${sectionTitle("Shipping", accent)}
        <p style="font-size:14px;margin:8px 0 12px 0;color:#44403c;">${escapeHtml(shipping || "Packed with care.")}</p>
      </div>
    </td>
  </tr>
  <tr>
    <td style="padding:24px 34px 34px 34px;text-align:center;border-top:1px solid ${c.border};">
      <div style="font-size:18px;font-style:italic;color:#1c1917;">${escapeHtml(thankYou)}</div>
      ${thankYouSub ? `<div style="font-size:13px;margin-top:8px;color:#78716c;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(thankYouSub)}</div>` : ""}
      <div style="font-size:11px;margin-top:14px;letter-spacing:2px;text-transform:uppercase;color:${accent};font-family:Arial,Helvetica,sans-serif;">${escapeHtml(footer)}</div>
    </td>
  </tr>
</table>`;
}

function buildLuxury(
  content: DescriptionContent,
  branding: StoreBranding,
): string {
  const { storeDisplay, slogan, thankYou, thankYouSub, shipping, footer, c } =
    brandBits(branding);
  const accent = c.accent || "#c6a667";
  const specs = specsRows(content);
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:860px;width:100%;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:${c.bodyText};line-height:1.6;background:#ffffff;border:1px solid ${c.border};">
  <tr>
    <td style="background:${c.headerBackground};padding:34px 30px;text-align:center;">
      <div style="font-size:11px;letter-spacing:4px;text-transform:uppercase;color:${accent};margin:0 0 10px 0;">Est. Collection</div>
      <div style="font-size:26px;font-weight:700;letter-spacing:4px;color:${c.headerText};">${escapeHtml(storeDisplay)}</div>
      <div style="margin:14px auto 0 auto;width:64px;height:1px;background:${accent};"></div>
      ${slogan ? `<div style="font-size:13px;margin-top:14px;color:#cbd5e1;letter-spacing:0.4px;">${escapeHtml(slogan)}</div>` : ""}
    </td>
  </tr>
  <tr>
    <td style="padding:34px 32px 12px 32px;background:${c.panelBackground};">
      <h1 style="font-size:24px;line-height:1.35;margin:0 0 14px 0;font-weight:600;color:${c.bodyText};letter-spacing:0.2px;">${escapeHtml(content.productTitle)}</h1>
      <p style="font-size:15px;margin:0 0 24px 0;color:#3f3f46;">${escapeHtml(content.productIntroduction)}</p>
      ${specs ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:0 0 24px 0;border:1px solid ${c.border};background:#ffffff;"><tr><td colspan="2" style="padding:12px 14px;background:${c.headerBackground};color:${accent};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Specifications</td></tr>${specs}</table>` : ""}
      ${sectionTitle("Highlights", accent)}
      <ul style="margin:0 0 22px 0;padding-left:18px;">${listItems(content.features, "See photos and details for key features.")}</ul>
      ${sectionTitle("Condition", accent)}
      <p style="font-size:14px;margin:8px 0 20px 0;color:#3f3f46;">${escapeHtml(content.itemCondition || "See listing.")}</p>
      ${sectionTitle("What's Included", accent)}
      <ul style="margin:8px 0 20px 0;padding-left:18px;">${listItems(content.packageContents, "See listing photos.")}</ul>
      ${sectionTitle("Shipping", accent)}
      <p style="font-size:14px;margin:8px 0 10px 0;color:#3f3f46;">${escapeHtml(shipping || "Discreet, secure packaging. Tracking when available.")}</p>
    </td>
  </tr>
  <tr>
    <td style="background:${c.headerBackground};padding:26px 30px;text-align:center;">
      <div style="font-size:16px;font-weight:600;color:${c.headerText};">${escapeHtml(thankYou)}</div>
      ${thankYouSub ? `<div style="font-size:12px;margin-top:8px;color:#94a3b8;">${escapeHtml(thankYouSub)}</div>` : ""}
      <div style="font-size:11px;margin-top:14px;letter-spacing:2px;text-transform:uppercase;color:${accent};">${escapeHtml(footer)}</div>
    </td>
  </tr>
</table>`;
}

function buildFresh(
  content: DescriptionContent,
  branding: StoreBranding,
): string {
  const { storeDisplay, slogan, thankYou, thankYouSub, shipping, footer, c } =
    brandBits(branding);
  const accent = c.accent || "#84cc16";
  const specs = specsRows(content);
  return `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:860px;width:100%;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:${c.bodyText};line-height:1.55;background:#ffffff;border:1px solid ${c.border};">
  <tr>
    <td style="background:${c.headerBackground};padding:24px 26px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td>
            <div style="font-size:22px;font-weight:800;color:${c.headerText};">${escapeHtml(storeDisplay)}</div>
            ${slogan ? `<div style="font-size:13px;margin-top:6px;color:#bbf7d0;">${escapeHtml(slogan)}</div>` : ""}
          </td>
          <td align="right" style="width:12px;background:${accent};">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="padding:28px 26px 10px 26px;">
      <div style="display:inline-block;background:${accent};color:#14532d;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;padding:5px 10px;margin:0 0 12px 0;">In Stock Ready</div>
      <h1 style="font-size:24px;line-height:1.3;margin:0 0 12px 0;font-weight:800;color:${c.bodyText};">${escapeHtml(content.productTitle)}</h1>
      <p style="font-size:15px;margin:0 0 20px 0;color:#3f6212;">${escapeHtml(content.productIntroduction)}</p>
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${c.panelBackground};border:1px solid ${c.border};margin:0 0 20px 0;">
        <tr>
          <td style="padding:16px 18px;">
            <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;margin:0 0 10px 0;color:${c.bodyText};">Why you'll like it</div>
            <ul style="margin:0;padding-left:18px;">${listItems(content.features, "See photos and details for key features.")}</ul>
          </td>
        </tr>
      </table>
      ${specs ? `<table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:collapse;margin:0 0 20px 0;">${specs}</table>` : ""}
      ${sectionTitle("Condition", accent, "pill")}
      <p style="font-size:14px;margin:0 0 18px 0;color:#3f6212;">${escapeHtml(content.itemCondition || "See listing.")}</p>
      ${sectionTitle("What's Included", accent, "pill")}
      <ul style="margin:0 0 18px 0;padding-left:18px;">${listItems(content.packageContents, "See listing photos.")}</ul>
      ${sectionTitle("Shipping", accent, "pill")}
      <p style="font-size:14px;margin:0 0 8px 0;color:#3f6212;">${escapeHtml(shipping || "Packed carefully. Tracking when available.")}</p>
    </td>
  </tr>
  <tr>
    <td style="padding:16px 26px 26px 26px;">
      <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:${c.headerBackground};">
        <tr>
          <td style="padding:20px;text-align:center;">
            <div style="font-size:17px;font-weight:800;color:${c.headerText};">${escapeHtml(thankYou)}</div>
            ${thankYouSub ? `<div style="font-size:13px;margin-top:6px;color:#bbf7d0;">${escapeHtml(thankYouSub)}</div>` : ""}
            <div style="font-size:12px;margin-top:10px;color:${accent};font-weight:700;">${escapeHtml(footer)}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;
}

const BUILDERS: Record<
  DescriptionTemplateId,
  (content: DescriptionContent, branding: StoreBranding) => string
> = {
  classic: buildClassic,
  modern: buildModern,
  editorial: buildEditorial,
  luxury: buildLuxury,
  fresh: buildFresh,
};

export function renderDescriptionTemplate(
  content: DescriptionContent,
  branding: StoreBranding,
): string {
  const id = resolveTemplateId(branding.templateId);
  return BUILDERS[id](content, branding);
}
