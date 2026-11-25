import Link from "next/link";
import { RESPONSE_BUSINESS_DAYS } from "@/lib/deadlines";

export default function HomePage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Request public records</h1>
      <p className="text-lg text-muted">
        Ask for records such as police reports, permits, contracts or emails. A records clerk
        reviews each request, and the city must respond within {RESPONSE_BUSINESS_DAYS} business
        days.
      </p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>Sign in and describe the records you need.</li>
        <li>Track your request as a clerk reviews it.</li>
        <li>Download the documents once they&apos;re released.</li>
      </ol>
      <Link
        href="/requests"
        className="inline-block rounded bg-accent px-4 py-2 font-medium text-white hover:bg-accent-strong"
      >
        Go to my requests
      </Link>
    </div>
  );
}
