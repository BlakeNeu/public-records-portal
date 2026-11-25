import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

const credentialsSchema = z.object({
  // Normalize first, then validate, so " Jane@Example.com" still matches.
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(200),
});

// Compared against when the email is unknown, so a miss takes as long as a
// wrong password and response times don't reveal which emails have accounts.
const DUMMY_HASH = "$2b$12$T4oCt8QvvHtWsCntI5392eYQeENZauCGVq2TE1K5wVCXGhgUmXSz6";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

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
            metadata: user ? { email } : { reason: "unknown_email" },
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
