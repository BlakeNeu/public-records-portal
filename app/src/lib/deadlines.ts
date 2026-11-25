// Statutory response window. Many states give agencies a set number of
// business days to respond; holidays are ignored in this demo.
export const RESPONSE_BUSINESS_DAYS = 10;

export function addBusinessDays(start: Date, days: number): Date {
  const result = new Date(start);
  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

export function dueDateFor(submittedAt: Date): Date {
  return addBusinessDays(submittedAt, RESPONSE_BUSINESS_DAYS);
}

export function isOverdue(
  request: { dueAt: Date; closedAt: Date | null },
  now: Date = new Date(),
): boolean {
  return request.closedAt === null && request.dueAt.getTime() < now.getTime();
}
