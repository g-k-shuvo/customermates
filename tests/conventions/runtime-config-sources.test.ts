import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../..");
const CONFIG_ENTRY = "core/fumadocs/source.config.ts";
const CANDIDATE_SUFFIXES = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveSpecifier(specifier: string, importer: string): string | null {
  const relative = specifier.startsWith("@/")
    ? specifier.slice(2)
    : specifier.startsWith(".")
      ? path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier))
      : null;

  if (relative === null) return null;

  for (const suffix of CANDIDATE_SUFFIXES) {
    if (existsSync(path.join(REPO_ROOT, relative + suffix))) return relative + suffix;
  }

  return existsSync(path.join(REPO_ROOT, relative)) ? relative : null;
}

function aliasedRootsReachableFromConfig(): Set<string> {
  const visited = new Set<string>();
  const roots = new Set<string>();
  const queue = [CONFIG_ENTRY];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || visited.has(file)) continue;
    visited.add(file);

    const absolute = path.join(REPO_ROOT, file);
    if (!existsSync(absolute)) continue;

    const source = readFileSync(absolute, "utf8");

    for (const [, specifier] of source.matchAll(/from\s+"([^"]+)"/g)) {
      if (specifier.startsWith("@/")) {
        const root = specifier.slice(2).split("/")[0];
        if (root) roots.add(root);
      }

      const resolved = resolveSpecifier(specifier, file);
      if (resolved) queue.push(resolved);
    }
  }

  return roots;
}

describe("runtime config sources", () => {
  it("ships every source directory the fumadocs config reaches into the runner image", () => {
    const dockerfile = readFileSync(path.join(REPO_ROOT, "Dockerfile"), "utf8");
    const runnerStage = dockerfile.slice(dockerfile.indexOf("AS runner"));

    const missing = [...aliasedRootsReachableFromConfig()]
      .filter((root) => !runnerStage.includes(`/app/${root} ./${root}`))
      .sort();

    expect(
      missing,
      `next.config.ts recompiles ${CONFIG_ENTRY} at startup, so every directory it imports must exist in the runner image. ` +
        `Add "COPY --from=builder /app/<dir> ./<dir>" for: ${missing.join(", ")}`,
    ).toEqual([]);
  });
});
