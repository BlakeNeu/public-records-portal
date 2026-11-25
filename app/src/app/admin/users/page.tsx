import type { Metadata } from "next";
import { Suspense } from "react";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { RoleBadge } from "@/components/badges";

export const metadata: Metadata = { title: "Users" };

export default function AdminUsersPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading users…</p>}>
      <UsersTable />
    </Suspense>
  );
}

async function UsersTable() {
  await requireUser("admin");
  const users = await prisma.user.findMany({
    orderBy: [{ role: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      _count: { select: { requests: true, assignedRequests: true } },
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
            <tr>
              <th scope="col" className="px-4 py-3">Name</th>
              <th scope="col" className="px-4 py-3">Email</th>
              <th scope="col" className="px-4 py-3">Role</th>
              <th scope="col" className="px-4 py-3 text-right">Filed</th>
              <th scope="col" className="px-4 py-3 text-right">Assigned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                <td className="px-4 py-3 text-right tabular-nums">{u._count.requests}</td>
                <td className="px-4 py-3 text-right tabular-nums">{u._count.assignedRequests}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
