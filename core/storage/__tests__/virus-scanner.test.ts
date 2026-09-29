import { createServer } from "node:net";

import { afterAll, describe, expect, it } from "vitest";

import { ClamdVirusScanner, VirusScanUnavailableError, parseClamdReply } from "../virus-scanner";

const EICAR = "X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

const server = createServer((socket) => {
  let all = Buffer.alloc(0);
  socket.on("data", (data: Buffer) => {
    all = Buffer.concat([all, data] as unknown as Uint8Array[]);
    if (all.length >= 4 && all.subarray(all.length - 4).readUInt32BE(0) === 0)
      socket.end(all.includes(Buffer.from("EICAR")) ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
  });
});
const listening = new Promise<number>((resolve) =>
  server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port)),
);

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("clamd scanning", () => {
  it("reads clean, infected and error replies", () => {
    expect(parseClamdReply("stream: OK\0")).toEqual({ clean: true });
    expect(parseClamdReply("stream: Eicar-Test-Signature FOUND\0")).toEqual({
      clean: false,
      signature: "Eicar-Test-Signature",
    });
    expect(() => parseClamdReply("INSTREAM size limit exceeded. ERROR\0")).toThrow(VirusScanUnavailableError);
  });

  it("streams bytes and a web stream over INSTREAM", async () => {
    const scanner = new ClamdVirusScanner("127.0.0.1", await listening);

    expect(await scanner.scan(new TextEncoder().encode("a harmless offer"))).toEqual({ clean: true });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(EICAR));
        controller.close();
      },
    });
    expect(await scanner.scan(stream)).toEqual({ clean: false, signature: "Eicar-Test-Signature" });
  });

  it("reports an unreachable daemon as unavailable", async () => {
    await expect(new ClamdVirusScanner("127.0.0.1", 1).scan(new Uint8Array([1]))).rejects.toBeInstanceOf(
      VirusScanUnavailableError,
    );
  });
});
