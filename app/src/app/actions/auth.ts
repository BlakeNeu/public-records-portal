"use server";

import { AuthError } from "next-auth";
import { LoginRateLimited, signIn, signOut } from "@/auth";
import { getCurrentUser } from "@/lib/dal";
import { recordAudit } from "@/lib/audit";

export type LoginState = { error?: string } | undefined;

// Only allow same-site relative paths, so a crafted ?callbackUrl= link can't
// bounce a freshly signed-in user to another site (open redirect).
function safeRedirect(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "";
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")
    ? path
    : "/requests";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: safeRedirect(formData.get("redirectTo")),
    });
  } catch (error) {
    // The lockout applies to every email alike, so naming it reveals nothing.
    if (error instanceof LoginRateLimited) {
      return { error: "Too many sign-in attempts. Wait 15 minutes and try again." };
    }
    // One message for every other failure, so it doesn't reveal which emails exist.
    if (error instanceof AuthError) return { error: "Incorrect email or password." };
    throw error; // includes the redirect Next.js throws on success
  }
}

export async function logout(): Promise<void> {
  const user = await getCurrentUser();
  if (user) {
    await recordAudit({
      action: "auth.logout",
      actorId: user.id,
      entityType: "user",
      entityId: user.id,
    });
  }
  await signOut({ redirectTo: "/login" });
}
