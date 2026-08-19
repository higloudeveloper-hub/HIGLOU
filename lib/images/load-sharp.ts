type SharpFn = typeof import("sharp").default;

let cached: SharpFn | null | undefined;

/**
 * Load sharp only when a photo actually needs native processing.
 * A top-level `import "sharp"` crashes the whole Vercel function if
 * libvips is missing from the serverless trace.
 */
export async function loadSharp(): Promise<SharpFn> {
  if (cached) return cached;
  if (cached === null) {
    throw new Error("Image processing is unavailable on this server.");
  }
  try {
    const mod = await import("sharp");
    cached = mod.default;
    return cached;
  } catch (error) {
    cached = null;
    throw error;
  }
}

export async function tryLoadSharp(): Promise<SharpFn | null> {
  try {
    return await loadSharp();
  } catch {
    return null;
  }
}
