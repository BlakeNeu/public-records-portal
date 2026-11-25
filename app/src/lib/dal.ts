import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { Role } from "@/generated/prisma/enums";

// Data access layer: every page and server action gets the current user here.
// The role comes from the database, not the cookie, so a demoted or deleted
// user loses access on their next request instead of when the session expires.

export type CurrentUser = { id: string; name: string; email: string; role: Role };

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });
});

/** Redirects to login when signed out; 404s when the role isn't allowed. */
export async function requireUser(...roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // A 404 rather than a 403 doesn't confirm that the page exists.
  if (roles.length > 0 && !roles.includes(user.role)) notFound();
  return user;
}

export const isStaff = (user: Pick<CurrentUser, "role">) =>
  user.role === "clerk" || user.role === "admin";
