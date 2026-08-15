import { requireUser, type AuthResult } from "@/lib/auth/require-user";
import { NextResponse } from "next/server";

const DEFAULT_OWNERS = ["higloudeveloper@gmail.com"];

export function ownerEmails() {
  const extra = (process.env.HIGLOU_OWNER_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_OWNERS, ...extra])];
}

export function isOwnerEmail(email?: string | null) {
  if (!email) return false;
  return ownerEmails().includes(email.trim().toLowerCase());
}

export async function requireOwner(): Promise<AuthResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (!isOwnerEmail(auth.user.email)) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Don Baratón is only available on the Higlou owner account.",
        },
        { status: 403 },
      ),
    };
  }
  return auth;
}
