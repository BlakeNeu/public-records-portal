import type { RequestStatus, Role } from "@/generated/prisma/enums";

const STATUS_STYLES: Record<RequestStatus, { label: string; className: string }> = {
  submitted: { label: "Submitted", className: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100" },
  in_review: { label: "In review", className: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
  fulfilled: { label: "Fulfilled", className: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200" },
  denied: { label: "Denied", className: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-200" },
};

const pill = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export function StatusBadge({ status }: { status: RequestStatus }) {
  const s = STATUS_STYLES[status];
  return <span className={`${pill} ${s.className}`}>{s.label}</span>;
}

export function OverdueBadge() {
  return <span className={`${pill} bg-danger text-white`}>Overdue</span>;
}

export function RoleBadge({ role }: { role: Role }) {
  return <span className={`${pill} border border-line capitalize text-foreground`}>{role}</span>;
}
