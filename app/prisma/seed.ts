// Seeds the local database with fake demo data. Every person, address and
// record below is invented. Run with:  npx prisma db seed
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import type { RequestStatus, Role } from "../src/generated/prisma/enums";
import { addBusinessDays, dueDateFor } from "../src/lib/deadlines";

if (process.env.NODE_ENV === "production") {
  throw new Error("Refusing to seed: NODE_ENV is production.");
}
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 12) {
  throw new Error("Set SEED_PASSWORD (12+ characters) in app/.env before seeding.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

const users: { key: string; name: string; email: string; role: Role }[] = [
  { key: "admin", name: "Alex Admin", email: "admin@example.org", role: "admin" },
  { key: "morgan", name: "Morgan Clerk", email: "morgan.clerk@example.org", role: "clerk" },
  { key: "riley", name: "Riley Clerk", email: "riley.clerk@example.org", role: "clerk" },
  { key: "jane", name: "Jane Citizen", email: "jane.citizen@example.com", role: "citizen" },
  { key: "sam", name: "Sam Resident", email: "sam.resident@example.com", role: "citizen" },
];

type SeedRequest = {
  requester: string;
  clerk?: string;
  subject: string;
  description: string;
  status: RequestStatus;
  submittedDaysAgo: number;
  documents?: { filename: string; contentType: string; sizeBytes: number; released: boolean }[];
  notes?: string[];
};

const requests: SeedRequest[] = [
  {
    requester: "jane",
    subject: "Police incident report for 400 block of Elm St",
    description:
      "Requesting the incident report and any dispatch logs for the noise complaint on Elm St reported in early September.",
    status: "fulfilled",
    submittedDaysAgo: 40,
    clerk: "morgan",
    documents: [
      { filename: "incident-report-redacted.pdf", contentType: "application/pdf", sizeBytes: 245_183, released: true },
      { filename: "dispatch-log.txt", contentType: "text/plain", sizeBytes: 12_408, released: true },
    ],
    notes: ["Redacted witness names under the personal privacy exemption."],
  },
  {
    requester: "jane",
    subject: "City council emails about the Oak Park playground budget",
    description:
      "All emails between council members and Parks & Recreation mentioning the Oak Park playground replacement, January through June.",
    status: "in_review",
    submittedDaysAgo: 9,
    clerk: "morgan",
    documents: [
      { filename: "council-emails-batch-1.pdf", contentType: "application/pdf", sizeBytes: 1_804_220, released: false },
    ],
    notes: ["Search returned ~300 emails. Reviewing for attorney-client privilege before release."],
  },
  {
    requester: "jane",
    subject: "Building permits issued for 12 Harbor View Rd",
    description: "Copies of all building permits and inspection results for 12 Harbor View Rd since 2020.",
    status: "submitted",
    submittedDaysAgo: 1,
  },
  {
    requester: "sam",
    subject: "Restaurant health inspection results, Main St corridor",
    description: "The two most recent health inspection reports for every restaurant on Main St between 1st and 8th Ave.",
    status: "in_review",
    submittedDaysAgo: 18, // past its 10-business-day deadline: shows as overdue
    clerk: "riley",
    notes: ["Waiting on the county health department to send scans."],
  },
  {
    requester: "sam",
    subject: "Snow removal contract with the public works vendor",
    description: "The current snow removal contract and any amendments.",
    status: "submitted",
    submittedDaysAgo: 16, // unassigned and overdue
  },
  {
    requester: "sam",
    subject: "Personnel file of a named city employee",
    description: "The full personnel file, including performance reviews, for a named employee in the finance department.",
    status: "denied",
    submittedDaysAgo: 30,
    clerk: "riley",
    notes: ["Denied: personnel records are exempt. Citizen was told about the appeal process."],
  },
  {
    requester: "jane",
    subject: "Traffic study for the Cedar Ave and 5th St intersection",
    description: "Any traffic or pedestrian safety studies done for the Cedar Ave and 5th St intersection in the last five years.",
    status: "fulfilled",
    submittedDaysAgo: 25,
    clerk: "riley",
    documents: [
      { filename: "cedar-5th-traffic-study.pdf", contentType: "application/pdf", sizeBytes: 3_201_554, released: true },
    ],
  },
];

async function main() {
  // TRUNCATE skips the row-level append-only trigger on audit_logs. That's
  // fine for a local reset; in AWS the app's DB role isn't granted TRUNCATE.
  await prisma.$executeRawUnsafe(
    `TRUNCATE "audit_logs", "request_notes", "request_documents", "records_requests", "users" RESTART IDENTITY CASCADE`,
  );

  const passwordHash = await bcrypt.hash(password!, 12);
  const ids: Record<string, string> = {};
  for (const u of users) {
    const created = await prisma.user.create({
      data: { name: u.name, email: u.email, role: u.role, passwordHash },
    });
    ids[u.key] = created.id;
  }

  // Oldest first, so reference numbers follow submission order.
  const ordered = [...requests].sort((a, b) => b.submittedDaysAgo - a.submittedDaysAgo);
  for (const [i, r] of ordered.entries()) {
    const submittedAt = daysAgo(r.submittedDaysAgo);
    const closed = r.status === "fulfilled" || r.status === "denied";
    const closedAt = closed ? addBusinessDays(submittedAt, 7) : null;
    const clerkId = r.clerk ? ids[r.clerk] : null;
    const referenceNumber = `PRR-${submittedAt.getUTCFullYear()}-${String(i + 1).padStart(4, "0")}`;

    const request = await prisma.recordsRequest.create({
      data: {
        referenceNumber,
        subject: r.subject,
        description: r.description,
        status: r.status,
        requesterId: ids[r.requester],
        assignedClerkId: clerkId,
        submittedAt,
        dueAt: dueDateFor(submittedAt),
        closedAt,
        documents: {
          create: (r.documents ?? []).map((d, j) => ({
            filename: d.filename,
            contentType: d.contentType,
            sizeBytes: d.sizeBytes,
            isReleased: d.released,
            storageKey: `seed/${referenceNumber}/${j + 1}`,
            uploadedById: clerkId ?? ids.admin,
          })),
        },
        notes: {
          create: (r.notes ?? []).map((body) => ({ body, authorId: clerkId ?? ids.admin })),
        },
      },
    });

    // The history a real request would have built up.
    const base = { entityType: "records_request", entityId: request.id, requestId: request.id };
    const audit: Prisma.AuditLogCreateManyInput[] = [
      { ...base, action: "request.created", actorId: ids[r.requester], createdAt: submittedAt },
    ];
    if (clerkId) {
      audit.push({
        ...base,
        action: "request.assigned",
        actorId: ids.admin,
        metadata: { assignedClerkId: clerkId },
        createdAt: new Date(submittedAt.getTime() + DAY),
      });
    }
    if (r.status !== "submitted") {
      audit.push({
        ...base,
        action: "request.status_changed",
        actorId: clerkId,
        metadata: { from: "submitted", to: r.status },
        createdAt: closedAt ?? new Date(submittedAt.getTime() + 2 * DAY),
      });
    }
    await prisma.auditLog.createMany({ data: audit });
  }

  console.log(`Seeded ${users.length} users and ${requests.length} requests.`);
  for (const u of users) console.log(`  ${u.role.padEnd(8)} ${u.email}`);
  console.log("All demo accounts use SEED_PASSWORD from app/.env.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
