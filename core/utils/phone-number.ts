export function compactPhoneNumber(raw: string): string {
  const compact = raw.trim().replace(/[\s().\-/]/g, "");

  return compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
}

export function compactPhoneList(value: string): string {
  return value
    .split(",")
    .map((entry) => compactPhoneNumber(entry))
    .filter((entry) => entry !== "")
    .join(",");
}
