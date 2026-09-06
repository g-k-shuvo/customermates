export function widgetSubheader(
  count: number,
  formattedTotal: string,
  groupsLabel: string,
  note?: string | null,
): string | null {
  if (count === 0) return null;

  const segments = [formattedTotal];
  if (count > 1) segments.push(`${count} ${groupsLabel}`);
  if (note) segments.push(note);

  return segments.join(" · ");
}
