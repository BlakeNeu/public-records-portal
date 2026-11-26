import { createHmac } from "node:crypto";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { clientIpFrom } from "@/lib/client-ip";

const credentialsSchema = z.object({
  // Normalize first, then validate, so " Jane@Example.com" still matches.
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(200),
});

// Compared against when the email is unknown, so a miss takes as long as a
// wrong password and response times don't reveal which emails have accounts.
const DUMMY_HASH = "$2b$12$T4oCt8QvvHtWsCntI5392eYQeENZauCGVq2TE1K5wVCXGhgUmXSz6";

// Brute-force limits, counted from the audit log so they hold across restarts
// and across every portal container. Failures are counted per email address
// (whether or not it has an account, so a lockout doesn't reveal which emails
// exist) and per IP address (to slow password spraying across many accounts).
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

/** Thrown from authorize() so the login form can say why sign-in was refused. */
export class LoginRateLimited extends CredentialsSignin {
  code = "rate_limited";
}

// A keyed hash of the address, so attempts on an email with no account can be
// counted without storing what was typed (people sometimes type a password
// into the email box).
function emailKeyFor(email: string): string {
  return createHmac("sha256", process.env.AUTH_SECRET ?? "").update(email).digest("base64url");
}

async function tooManyFailures(emailKey: string, ip: string | null): Promise<boolean> {
  const recent = {
    action: "auth.login_failed",
    createdAt: { gte: new Date(Date.now() - LOGIN_WINDOW_MS) },
  };
  const [byEmail, byIp] = await Promise.all([
    prisma.auditLog.count({
      where: { ...recent, metadata: { path: ["emailKey"], equals: emailKey } },
    }),
    ip ? prisma.auditLog.count({ where: { ...recent, ipAddress: ip } }) : 0,
  ]);
  return byEmail >= MAX_FAILURES_PER_EMAIL || byIp >= MAX_FAILURES_PER_IP;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const emailKey = emailKeyFor(email);

        // Checked before the user lookup and bcrypt, so a blocked attempt
        // looks the same whether or not the account exists.
        if (await tooManyFailures(emailKey, clientIpFrom(request.headers))) {
          await recordAudit({
            action: "auth.login_rate_limited",
            entityType: "user",
            metadata: { emailKey },
          });
          throw new LoginRateLimited();
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, role: true, passwordHash: true },
        });
        const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

        if (!user || !valid) {
          await recordAudit({
            action: "auth.login_failed",
            actorId: user?.id ?? null,
            entityType: "user",
            entityId: user?.id ?? null,
            // Record which address was tried, but only for accounts that exist.
            metadata: user ? { email, emailKey } : { reason: "unknown_email", emailKey },
          });
          return null;
        }

        await recordAudit({
          action: "auth.login_succeeded",
          actorId: user.id,
          entityType: "user",
          entityId: user.id,
        });
        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
});
