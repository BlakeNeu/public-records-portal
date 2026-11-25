import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Runs before every matched route. It only decodes the session cookie;
// see the `authorized` callback in auth.config.ts for the rules.
const { auth } = NextAuth(authConfig);
export default auth;

export const config = {
  // Skip Auth.js's own endpoints, Next.js assets and static files.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
