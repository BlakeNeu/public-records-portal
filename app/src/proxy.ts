import NextAuth from "next-auth";
import type { NextFetchEvent, NextMiddleware, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { clientIpFrom } from "@/lib/client-ip";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

// Runs before every matched route. It rate-limits, then decodes the session
// cookie; see the `authorized` callback in auth.config.ts for the access rules.

const MINUTE = 60_000;

// Per IP, generous because an office can share one address behind NAT.
const ipLimit = createRateLimiter({ limit: 600, windowMs: MINUTE });
// Per signed-in user, whatever IPs they come from. Page loads prefetch the
// links they show, so one page view can be dozens of requests.
const userLimit = createRateLimiter({ limit: 300, windowMs: MINUTE });
// Writes (form posts and server actions) are what cost the most.
const ipWriteLimit = createRateLimiter({ limit: 60, windowMs: MINUTE });
const userWriteLimit = createRateLimiter({ limit: 30, windowMs: MINUTE });

const isWrite = (req: Request) => req.method !== "GET" && req.method !== "HEAD";

const { auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    authorized(params) {
      const id = params.auth?.user?.id;
      if (id) {
        const result = isWrite(params.request)
          ? userWriteLimit.hit(id)
          : userLimit.hit(id);
        if (!result.ok) return tooManyRequests(result.retryAfterSeconds);
      }
      return authConfig.callbacks.authorized(params);
    },
  },
});
// `auth` is typed as a wrapper, but called directly it is the proxy itself.
const authProxy = auth as unknown as NextMiddleware;

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const ip = clientIpFrom(request.headers) ?? "unknown";
  for (const limiter of isWrite(request) ? [ipLimit, ipWriteLimit] : [ipLimit]) {
    const result = limiter.hit(ip);
    if (!result.ok) return tooManyRequests(result.retryAfterSeconds);
  }

  // Auth.js's own endpoints are rate-limited above but have no access rules.
  if (request.nextUrl.pathname.startsWith("/api/auth")) return NextResponse.next();
  return authProxy(request, event);
}

export const config = {
  // Skip Next.js assets and static files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)$).*)"],
};
