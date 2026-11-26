import Link from "next/link";
import { getCurrentUser } from "@/lib/dal";

const className = "font-semibold tracking-tight";

/** Plain text, used while the session loads and for signed-in users. */
export function SiteTitleText() {
  return <span className={className}>Public Records Portal</span>;
}

// Signed-out visitors can click back to the home page. Signed-in users stay in
// the app; their way around is the account menu.
export async function SiteTitle() {
  const user = await getCurrentUser();
  if (user) return <SiteTitleText />;
  return (
    <Link href="/" className={className}>
      Public Records Portal
    </Link>
  );
}
