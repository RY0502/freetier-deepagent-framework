/**
 * Lightweight date-extraction heuristics used by the eval suite to
 * judge whether an agent's final answer (or a tool's raw output)
 * references dates that are recent enough for a "today"/"latest"
 * style task. Not exhaustive NLP — good enough to flag obviously
 * stale results (e.g. "...as of March 2025" showing up for a "today"
 * query run in July 2026).
 */

// Matches "2025-07-20", "July 20, 2025", "20 July 2025", or a bare 4-digit year.
const ISO_DATE_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
const MONTH_NAME_DATE_RE = /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi;
const BARE_YEAR_RE = /\b(20\d{2})\b/g;

const MONTHS: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

/** Extracts all explicit dates found in `text` as JS `Date` objects (best-effort). */
export function extractDates(text: string): Date[] {
  const dates: Date[] = [];

  for (const m of text.matchAll(ISO_DATE_RE)) {
    const [, y, mo, d] = m;
    dates.push(new Date(Number(y), Number(mo) - 1, Number(d)));
  }
  for (const m of text.matchAll(MONTH_NAME_DATE_RE)) {
    const [, monthName, day, year] = m;
    const monthIdx = MONTHS[monthName.toLowerCase()];
    if (monthIdx !== undefined) {
      dates.push(new Date(Number(year), monthIdx, Number(day)));
    }
  }
  return dates.filter((d) => !Number.isNaN(d.getTime()));
}

/** Extracts bare 4-digit years (2000-2099) mentioned in `text`, deduplicated. */
export function extractYears(text: string): number[] {
  const years = new Set<number>();
  for (const m of text.matchAll(BARE_YEAR_RE)) {
    years.add(Number(m[1]));
  }
  return [...years];
}

/**
 * Returns the age in days of the oldest *and* newest explicit date
 * found in `text` relative to `now`, or `null` if no dates were found.
 * Callers typically care about the newest date (freshest evidence the
 * agent actually surfaced) when judging recency compliance.
 */
export function dateAgeSummary(text: string, now: Date = new Date()): { oldestDays: number; newestDays: number } | null {
  const dates = extractDates(text);
  if (dates.length === 0) return null;
  const diffs = dates.map((d) => Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)));
  return { oldestDays: Math.max(...diffs), newestDays: Math.min(...diffs) };
}

/**
 * Heuristic staleness flag: true if `text` mentions a year strictly
 * older than the current year AND does not mention the current year
 * at all — a strong signal the content is not "today's"/"current".
 */
export function looksStaleByYear(text: string, now: Date = new Date()): boolean {
  const years = extractYears(text);
  if (years.length === 0) return false;
  const currentYear = now.getFullYear();
  const hasCurrentYear = years.includes(currentYear);
  const hasOlderYear = years.some((y) => y < currentYear);
  return hasOlderYear && !hasCurrentYear;
}
