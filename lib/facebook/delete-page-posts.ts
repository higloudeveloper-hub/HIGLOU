/**
 * Bulk delete Facebook Page posts via Graph API.
 */

export type PagePostSummary = {
  id: string;
  createdTime: string | null;
  message: string | null;
};

async function graphJson<T>(
  url: URL,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; body: T | null }> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => null)) as T | null;
  return { ok: res.ok, status: res.status, body };
}

/**
 * List published Page posts (newest first), paginated.
 */
export async function listFacebookPagePosts(opts: {
  pageId: string;
  accessToken: string;
  limit?: number;
}): Promise<
  | { ok: true; posts: PagePostSummary[]; hasMore: boolean }
  | { ok: false; error: string }
> {
  const limit = Math.min(Math.max(opts.limit || 25, 1), 100);
  const url = new URL(
    `https://graph.facebook.com/v21.0/${opts.pageId}/published_posts`,
  );
  url.searchParams.set("fields", "id,created_time,message");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("access_token", opts.accessToken);

  const { ok, body } = await graphJson<{
    data?: Array<{ id?: string; created_time?: string; message?: string }>;
    paging?: { next?: string };
    error?: { message?: string };
  }>(url);

  if (!ok || !body) {
    return {
      ok: false,
      error: body?.error?.message || "No se pudieron listar los posts de la Page.",
    };
  }

  const posts: PagePostSummary[] = (body.data || [])
    .filter((p) => p.id)
    .map((p) => ({
      id: String(p.id),
      createdTime: p.created_time || null,
      message: p.message ? String(p.message).slice(0, 120) : null,
    }));

  return {
    ok: true,
    posts,
    hasMore: Boolean(body.paging?.next),
  };
}

/**
 * Delete up to `max` published posts (newest first), paging through Graph.
 * Caps at 500 per call to avoid runaway jobs / Graph rate limits.
 */
export async function deleteFacebookPagePosts(opts: {
  pageId: string;
  accessToken: string;
  /** How many to delete this run (max 500) */
  max: number;
}): Promise<{
  ok: boolean;
  deleted: number;
  failed: number;
  remainingHint: boolean;
  errors: string[];
}> {
  const max = Math.min(Math.max(opts.max, 1), 500);
  let deleted = 0;
  let failed = 0;
  const errors: string[] = [];
  let cursor: string | null = null;
  let remainingHint = false;

  while (deleted + failed < max) {
    const batchSize = Math.min(50, max - deleted - failed);
    const url = new URL(
      `https://graph.facebook.com/v21.0/${opts.pageId}/published_posts`,
    );
    url.searchParams.set("fields", "id");
    url.searchParams.set("limit", String(batchSize));
    url.searchParams.set("access_token", opts.accessToken);
    if (cursor) url.searchParams.set("after", cursor);

    const listed = await graphJson<{
      data?: Array<{ id?: string }>;
      paging?: { cursors?: { after?: string }; next?: string };
      error?: { message?: string };
    }>(url);

    if (!listed.ok || !listed.body?.data) {
      errors.push(
        listed.body?.error?.message || "Fallo al listar posts para borrar.",
      );
      break;
    }

    const ids = listed.body.data
      .map((p) => String(p.id || ""))
      .filter(Boolean);
    if (!ids.length) break;

    for (const id of ids) {
      if (deleted + failed >= max) break;
      const delUrl = new URL(`https://graph.facebook.com/v21.0/${id}`);
      delUrl.searchParams.set("access_token", opts.accessToken);
      const del = await graphJson<{
        success?: boolean;
        error?: { message?: string };
      }>(delUrl, { method: "DELETE" });

      if (del.ok && del.body?.success !== false) {
        deleted += 1;
      } else {
        failed += 1;
        const msg = del.body?.error?.message || `No se pudo borrar ${id}`;
        if (errors.length < 8) errors.push(msg);
      }
      // Soft pace — Graph rate limits
      await new Promise((r) => setTimeout(r, 80));
    }

    const after = listed.body.paging?.cursors?.after;
    if (!after || !listed.body.paging?.next) {
      remainingHint = false;
      break;
    }
    cursor = after;
    remainingHint = true;
  }

  return {
    ok: failed === 0 || deleted > 0,
    deleted,
    failed,
    remainingHint,
    errors,
  };
}
