import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

// Config shared by the proxy and the full Auth.js setup in auth.ts.
// It has no providers and no database access, so the proxy stays a cheap
// cookie check on every request.

const PUBLIC_PATHS = new Set(["/", "/login"]);

// Optimistic, cookie-only role gates. The real checks happen in the data
// access layer (src/lib/dal.ts), which re-reads the user's role from the DB.
const ROLE_GATES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/admin", roles: ["admin"] },
];

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 }, // one working day
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const path = nextUrl.pathname;
      const user = auth?.user;

      if (path === "/login" && user) {
        return Response.redirect(new URL("/requests", nextUrl));
      }
      if (PUBLIC_PATHS.has(path)) return true;
      if (!user) return false; // Auth.js redirects to /login with a callbackUrl

      const gate = ROLE_GATES.find((g) => path.startsWith(g.prefix));
      if (gate && !gate.roles.includes(user.role)) {
        return Response.redirect(new URL("/requests", nextUrl));
      }
      return true;
    },
    jwt({ token, user }) {
      // `user` is only present right after sign-in.
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
} satisfies NextAuthConfig;
