// The client's IP address, for audit rows and rate limits.
//
// X-Forwarded-For is a list that each proxy appends to, so only the entries
// added by proxies we run can be trusted. Anything to their left came from the
// client and can be made up. With one load balancer in front of the portal,
// the right-most entry is the address the load balancer saw. Set
// TRUSTED_PROXY_HOPS if more proxies sit in front (a CDN plus a load balancer
// is 2).
//
// With no proxy at all (local Docker), Next.js fills the header from the
// socket only when the client didn't send one, so the value can be faked.
// That's why the login limits also key on the account, not just the IP.

const hops = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS) || 1);

export function clientIpFrom(headers: Headers): string | null {
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return chain[chain.length - hops] ?? chain[0] ?? headers.get("x-real-ip");
}
