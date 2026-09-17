type MonetizationLogLevel = "info" | "warn" | "error";

type MonetizationLogEvent = {
  level: MonetizationLogLevel;
  event: string;
  detail?: Record<string, unknown>;
};

const SENSITIVE_KEY =
  /(secret|token|password|key|authorization|cookie|private)/i;

function scrub(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 240) return `${value.slice(0, 240)}…`;
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(scrub);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(k)) {
      out[k] = "[redacted]";
      continue;
    }
    out[k] = scrub(v);
  }
  return out;
}

/** Structured logs for Money Engine — never persist secrets. */
export function logMonetizationEvent(payload: MonetizationLogEvent) {
  const line = {
    scope: "monetization",
    level: payload.level,
    event: payload.event,
    detail: payload.detail ? scrub(payload.detail) : undefined,
    at: new Date().toISOString(),
  };
  if (payload.level === "error") {
    console.error("[monetization]", JSON.stringify(line));
    return;
  }
  if (payload.level === "warn") {
    console.warn("[monetization]", JSON.stringify(line));
    return;
  }
  console.info("[monetization]", JSON.stringify(line));
}
