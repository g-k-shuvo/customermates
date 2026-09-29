import { connect } from "node:net";

export type ScanVerdict = { clean: true } | { clean: false; signature: string };

export class VirusScanUnavailableError extends Error {}

export type VirusScanner = {
  readonly configured: boolean;
  scan(body: ReadableStream<Uint8Array> | Uint8Array): Promise<ScanVerdict>;
};

export const NULL_VIRUS_SCANNER: VirusScanner = {
  configured: false,
  scan: () => Promise.resolve({ clean: true }),
};

const CLAMD_CHUNK_BYTES = 64 * 1024;
const CLAMD_TIMEOUT_MS = 60_000;

function lengthPrefix(length: number): Uint8Array {
  const prefix = new Uint8Array(4);
  new DataView(prefix.buffer).setUint32(0, length);
  return prefix;
}

async function* chunksOf(body: ReadableStream<Uint8Array> | Uint8Array): AsyncGenerator<Uint8Array> {
  if (body instanceof Uint8Array) {
    for (let offset = 0; offset < body.byteLength; offset += CLAMD_CHUNK_BYTES)
      yield body.subarray(offset, offset + CLAMD_CHUNK_BYTES);
    return;
  }

  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    if (value && value.byteLength > 0) yield value;
  }
}

export function parseClamdReply(reply: string): ScanVerdict {
  const text = reply.replace(/\0/g, "").trim();
  if (/: OK$/.test(text)) return { clean: true };

  const found = /: (.+) FOUND$/.exec(text);
  if (found) return { clean: false, signature: found[1] };

  throw new VirusScanUnavailableError(text || "empty clamd reply");
}

export class ClamdVirusScanner implements VirusScanner {
  readonly configured = true;

  constructor(
    private host: string,
    private port: number,
  ) {}

  async scan(body: ReadableStream<Uint8Array> | Uint8Array): Promise<ScanVerdict> {
    const socket = connect({ host: this.host, port: this.port });
    socket.setTimeout(CLAMD_TIMEOUT_MS);

    const reply = new Promise<string>((resolve, reject) => {
      let text = "";
      socket.on("data", (data) => (text += data.toString("utf8")));
      socket.on("end", () => resolve(text));
      socket.on("timeout", () => {
        socket.destroy();
        reject(new VirusScanUnavailableError("clamd timed out"));
      });
      socket.on("error", (error) => reject(new VirusScanUnavailableError(error.message)));
    });

    void reply.catch(() => undefined);

    const write = (bytes: Uint8Array) =>
      new Promise<void>((resolve, reject) => socket.write(bytes, (error) => (error ? reject(error) : resolve())));

    try {
      await new Promise<void>((resolve, reject) => {
        socket.once("connect", resolve);
        socket.once("error", reject);
      });
      await write(new TextEncoder().encode("zINSTREAM\0"));
      for await (const chunk of chunksOf(body)) {
        await write(lengthPrefix(chunk.byteLength));
        await write(chunk);
      }
      await write(lengthPrefix(0));
    } catch (error) {
      socket.destroy();
      throw error instanceof VirusScanUnavailableError
        ? error
        : new VirusScanUnavailableError(error instanceof Error ? error.message : "clamd write failed");
    }

    return parseClamdReply(await reply);
  }
}

export function virusScannerFor(config: { host?: string; port?: number }): VirusScanner {
  return config.host ? new ClamdVirusScanner(config.host, config.port ?? 3310) : NULL_VIRUS_SCANNER;
}
