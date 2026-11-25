import Link from "next/link";
import { getCurrentUser, isStaff } from "@/lib/dal";
import { logout } from "@/app/actions/auth";
import { RoleBadge } from "@/components/badges";

export async function UserMenu() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <Link href="/login" className="text-sm font-medium text-accent hover:underline">
        Sign in
      </Link>
    );
  }

  return (
    <nav aria-label="Account" className="flex flex-wrap items-center gap-4 text-sm">
      <Link href="/requests" className="hover:underline">
        {isStaff(user) ? "All requests" : "My requests"}
      </Link>
      {user.role === "admin" && (
        <Link href="/admin/users" className="hover:underline">
          Users
        </Link>
      )}
      <span className="flex items-center gap-2 text-muted">
        {user.name}
        <RoleBadge role={user.role} />
      </span>
      <form action={logout}>
        <button type="submit" className="rounded border border-line px-2 py-1 hover:bg-background">
          Sign out
        </button>
      </form>
    </nav>
  );
}
