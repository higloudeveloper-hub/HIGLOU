"use client";

import Link from "next/link";
import { HiglouLogo } from "@/components/brand/higlou-logo";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  signInWithPassword,
  type AuthActionState,
} from "@/app/login/actions";

const initialState: AuthActionState = {};

export default function LoginForm() {
  const searchParams = useSearchParams();
  const message = searchParams.get("message");
  const redirectParam = searchParams.get("redirect") || "/home";
  const redirectTo = redirectParam === "/" ? "/home" : redirectParam;
  const [state, formAction, pending] = useActionState(
    signInWithPassword,
    initialState,
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-white px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_50%_at_18%_-8%,rgba(255,199,44,0.05),transparent_58%),radial-gradient(55%_40%_at_92%_8%,rgba(10,10,10,0.03),transparent_52%)]"
      />
      <div className="relative w-full max-w-md">
        <HiglouLogo href="/" size={36} className="text-zinc-950" />
        <p className="mt-2 text-sm tracking-[-0.01em] text-zinc-500">
          Sign in to create eBay listings from product photos.
        </p>

        <div className="mt-8 space-y-5 border-t border-zinc-900/8 pt-8">
          <h1 className="font-[family-name:var(--font-instrument-serif)] text-2xl tracking-[-0.02em] text-zinc-950">
            Sign in
          </h1>

          {message ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {message}
            </p>
          ) : null}

          {state.error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          ) : null}

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="redirect" value={redirectTo} />
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@higlou.store"
                required
                className="h-11 bg-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="h-11 bg-white"
              />
            </div>
            <Button
              type="submit"
              className="h-11 w-full rounded-full bg-zinc-950 text-white hover:bg-zinc-900"
              disabled={pending}
              title={pending ? "Signing in…" : "Sign in with email and password"}
            >
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="flex items-center justify-between gap-3 text-sm">
            <Link
              href="/forgot-password"
              className="text-zinc-600 underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
            <Link
              href="/"
              className="text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline"
            >
              Back to Higlou
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
