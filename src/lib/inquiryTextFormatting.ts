export function normalizePersonName(value: string): string {
  return normalizeTitleCase(value);
}

export function normalizeTitleCase(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(
      /(^|[\s'-])(\p{L})/gu,
      (_, separator: string, letter: string) =>
        separator + letter.toLocaleUpperCase(),
    );
}
