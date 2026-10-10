export type RosterNameMatchingMode = 'exact' | 'ignore_trailing_numbers' | 'fuzzy_suggestions';
export type RosterNameSensitivity = 'strict' | 'standard' | 'loose';

/** Keeps the OCR source text intact while making a stable comparison key. */
export function normalizeRosterName(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, '').toLocaleLowerCase();
}

/** Numeric row labels are common in exported rosters (for example, Jason0). */
export function withoutTrailingRosterNumber(value: string | null | undefined): string {
  return normalizeRosterName(value).replace(/[0-9０-９]+$/u, '');
}

export function rosterComparisonKey(
  value: string | null | undefined,
  mode: RosterNameMatchingMode,
): string {
  return mode === 'ignore_trailing_numbers'
    ? withoutTrailingRosterNumber(value)
    : normalizeRosterName(value);
}

/** Normalized Levenshtein similarity. It is intentionally only for suggestions. */
export function rosterNameSimilarity(left: string, right: string): number {
  const a = normalizeRosterName(left);
  const b = normalizeRosterName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = saved;
    }
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}

export function rosterSuggestionThreshold(sensitivity: RosterNameSensitivity): number {
  switch (sensitivity) {
    case 'strict': return 0.9;
    case 'loose': return 0.5;
    // A three-character Chinese name with one OCR error is about 0.667.
    case 'standard': return 0.66;
    default: return 0.9;
  }
}

/** Same-sheet names are never safe candidates for an automatic merge. */
export function canSuggestRosterMatch(
  sourceName: string,
  candidateName: string,
  namesInSameSchedule: Iterable<string>,
  sensitivity: RosterNameSensitivity = 'standard',
): boolean {
  const source = normalizeRosterName(sourceName);
  const candidate = normalizeRosterName(candidateName);
  if (!source || !candidate || source === candidate) return false;
  const present = new Set(Array.from(namesInSameSchedule, normalizeRosterName));
  if (present.has(source) && present.has(candidate)) return false;
  return rosterNameSimilarity(source, candidate) >= rosterSuggestionThreshold(sensitivity);
}

/** Person identity is independent of whether a row is rendered as self. */
export function reviewedRowPersonId(
  rowIndex: number,
  personIds?: ReadonlyMap<number, string>,
): string | null {
  return personIds?.get(rowIndex) ?? null;
}
