const MAX_VARIANTS = 27;
const MIN_EXPANDABLE_LENGTH = 3;

const UMLAUT_OF: Record<string, string> = { a: "ä", o: "ö", u: "ü" };
const BASE_OF: Record<string, string> = { ä: "a", ö: "o", ü: "u" };

type Segment = { options: string[]; explicit: boolean };

function segmentsOf(term: string): Segment[] {
  const segments: Segment[] = [];
  let index = 0;

  while (index < term.length) {
    const char = term[index];
    const pair = term.slice(index, index + 2);
    const pairBase = pair[0];

    if (pair.length === 2 && pair[1] === "e" && UMLAUT_OF[pairBase]) {
      segments.push({ options: [pair, UMLAUT_OF[pairBase], pairBase], explicit: true });
      index += 2;
    } else if (BASE_OF[char]) {
      segments.push({ options: [char, `${BASE_OF[char]}e`, BASE_OF[char]], explicit: true });
      index += 1;
    } else if (pair === "ss") {
      segments.push({ options: ["ss", "ß"], explicit: true });
      index += 2;
    } else if (char === "ß") {
      segments.push({ options: ["ß", "ss"], explicit: true });
      index += 1;
    } else if (UMLAUT_OF[char]) {
      segments.push({ options: [char, UMLAUT_OF[char], `${char}e`], explicit: false });
      index += 1;
    } else {
      segments.push({ options: [char], explicit: false });
      index += 1;
    }
  }

  return segments;
}

export function searchTermVariants(term: string): string[] {
  const lowered = term.toLowerCase();
  if (lowered.length < MIN_EXPANDABLE_LENGTH) return [term];

  const segments = segmentsOf(lowered);
  const expandable = segments
    .map((segment, position) => ({ segment, position }))
    .filter(({ segment }) => segment.options.length > 1)
    .sort((left, right) => Number(right.segment.explicit) - Number(left.segment.explicit));

  const chosen = new Set<number>();
  let combinations = 1;
  for (const { segment, position } of expandable) {
    if (combinations * segment.options.length > MAX_VARIANTS) continue;
    combinations *= segment.options.length;
    chosen.add(position);
  }

  let variants = [""];
  segments.forEach((segment, position) => {
    const options = chosen.has(position) ? segment.options : [segment.options[0]];
    variants = variants.flatMap((prefix) => options.map((option) => prefix + option));
  });

  return [...new Set([lowered, ...variants])];
}
