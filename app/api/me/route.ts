import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/require-user";
import { isOwnerEmail } from "@/lib/auth/owner";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    email: auth.user.email ?? null,
    owner: isOwnerEmail(auth.user.email),
  });
}
