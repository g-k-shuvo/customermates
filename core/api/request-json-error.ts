import { InvalidJsonBodyError } from "@/core/errors/app-errors";

export function mapRequestJsonError(error: unknown): never {
  if (error instanceof SyntaxError) throw new InvalidJsonBodyError();
  throw error;
}

export async function readOptionalJsonBody(request: { text(): Promise<string> }): Promise<Record<string, unknown>> {
  const raw = (await request.text()).trim();

  if (raw.length === 0) return {};

  try {
    const parsed: unknown = JSON.parse(raw);

    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch (error) {
    return mapRequestJsonError(error);
  }
}
