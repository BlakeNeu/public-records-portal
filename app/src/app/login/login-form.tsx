"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "@/app/actions/auth";

// Auth.js passes an absolute callbackUrl. Keep only its path, so even a
// foreign URL lands on a page of this site. The server validates it again
// (safeRedirect in actions/auth.ts).
function toLocalPath(callbackUrl: string | null): string {
  if (!callbackUrl) return "/requests";
  try {
    const url = new URL(callbackUrl, "http://placeholder.invalid");
    return url.pathname + url.search;
  } catch {
    return "/requests";
  }
}

const input =
  "w-full rounded border border-line bg-surface px-3 py-2 focus:outline-2 focus:outline-accent";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const redirectTo = toLocalPath(useSearchParams().get("callbackUrl"));

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-line bg-surface p-6">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className={input} />
      </div>
      <div className="space-y-1">
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={input}
        />
      </div>
      {state?.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
