import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Sign in</h1>
      {/* The form reads ?callbackUrl= from the URL, which is request-time data. */}
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="mt-6 text-sm text-muted">
        Demo accounts are listed in the project README. All data is fake.
      </p>
    </div>
  );
}
