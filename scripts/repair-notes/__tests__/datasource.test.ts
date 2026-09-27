import { describe, expect, it } from "vitest";

import { LIBPQ_ROUTING_VARIABLES } from "../../local-database-safety";
import { DatasourceError, assertTargetAllowed, describeDatasource, resolveDatasource } from "../datasource";

const DEV = "postgresql://postgres:secret@127.0.0.1:37987/customermates";
const TEST = "postgresql://postgres:secret@127.0.0.1:37988/customermates_test";
const REMOTE = "postgresql://crm:secret@db.example.com:5432/crm";

describe("resolveDatasource", () => {
  it("follows DIRECT_URL, as prisma.config.ts does, and says so", () => {
    const datasource = resolveDatasource({ DIRECT_URL: TEST, DATABASE_URL: ` ${TEST} ` });

    expect(datasource).toMatchObject({
      url: TEST,
      variable: "DIRECT_URL",
      host: "127.0.0.1",
      port: 37988,
      database: "customermates_test",
      local: true,
    });
    expect(describeDatasource(datasource)).toBe("Datasource: 127.0.0.1:37988/customermates_test (from DIRECT_URL)");
  });

  it("hands pg an explicit host, port and database, so no environment fallback can redirect it", () => {
    expect(resolveDatasource({ DATABASE_URL: TEST }).connection).toEqual({
      host: "127.0.0.1",
      port: 37988,
      database: "customermates_test",
      user: "postgres",
      password: "secret",
    });
  });

  it("uses the default port when the URL names none, and prints it", () => {
    const datasource = resolveDatasource({ DATABASE_URL: "postgresql://postgres@127.0.0.1/customermates_test" });

    expect(datasource.connection).toMatchObject({ port: 5432 });
    expect(describeDatasource(datasource)).toBe("Datasource: 127.0.0.1:5432/customermates_test (from DATABASE_URL)");
  });

  it("treats IPv6 loopback as local and connects to the bare address", () => {
    const datasource = resolveDatasource({ DATABASE_URL: "postgresql://postgres@[::1]:37988/customermates_test" });

    expect(datasource).toMatchObject({ local: true, connection: { host: "::1", port: 37988 } });
    expect(describeDatasource(datasource)).toBe("Datasource: [::1]:37988/customermates_test (from DATABASE_URL)");
  });

  it("falls back to DATABASE_URL when DIRECT_URL is unset or blank", () => {
    expect(resolveDatasource({ DATABASE_URL: TEST }).variable).toBe("DATABASE_URL");
    expect(resolveDatasource({ DIRECT_URL: "  ", DATABASE_URL: TEST }).variable).toBe("DATABASE_URL");
  });

  it("refuses to guess when only DATABASE_URL was pointed somewhere else", () => {
    expect(() => resolveDatasource({ DIRECT_URL: DEV, DATABASE_URL: TEST })).toThrow(
      /DIRECT_URL points at 127\.0\.0\.1:37987\/customermates but DATABASE_URL points at 127\.0\.0\.1:37988\/customermates_test/,
    );
  });

  it.each([...LIBPQ_ROUTING_VARIABLES, "PGOPTIONS"])("refuses while %s is set", (name) => {
    expect(() => resolveDatasource({ DATABASE_URL: TEST, [name]: "anything" })).toThrow(
      new RegExp(`${name} must be unset`),
    );
  });

  it("refuses a port-less URL while PGPORT would pick the port", () => {
    expect(() =>
      resolveDatasource({ DATABASE_URL: "postgresql://postgres@127.0.0.1/customermates_test", PGPORT: "37987" }),
    ).toThrow(/PGPORT must be unset/);
  });

  it.each([
    ["names no database", "postgresql://postgres@127.0.0.1:37988", /names no database/],
    ["names no host", "postgresql:///customermates_test", /names no host/],
    ["has an empty host after the user", "postgresql://postgres@/customermates_test", /not a valid PostgreSQL URL/],
    [
      "sets connection options",
      "postgresql://postgres@127.0.0.1:37988/customermates_test?options=-c%20search_path%3Dother",
      /sets connection options/,
    ],
    ["selects another schema", "postgresql://postgres@127.0.0.1:37988/customermates_test?schema=other", /schema/],
    ["is no PostgreSQL URL", "mysql://root@127.0.0.1:3306/crm", /must use PostgreSQL/],
    ["is no URL", "not a url", /not a valid PostgreSQL URL/],
  ])("refuses a URL that %s", (_, url, message) => {
    expect(() => resolveDatasource({ DATABASE_URL: url })).toThrow(DatasourceError);
    expect(() => resolveDatasource({ DATABASE_URL: url })).toThrow(message);
  });

  it("accepts the public schema Prisma URLs often name", () => {
    expect(resolveDatasource({ DATABASE_URL: `${TEST}?schema=public` }).database).toBe("customermates_test");
  });

  it("needs a database", () => {
    expect(() => resolveDatasource({})).toThrow(DatasourceError);
  });

  it("never prints the password", () => {
    expect(describeDatasource(resolveDatasource({ DATABASE_URL: REMOTE }))).toBe(
      "Datasource: db.example.com:5432/crm (from DATABASE_URL, remote)",
    );
  });
});

describe("assertTargetAllowed", () => {
  it("allows a loopback database", () => {
    expect(() => assertTargetAllowed(resolveDatasource({ DATABASE_URL: DEV }), false)).not.toThrow();
  });

  it("refuses a remote database unless --allow-remote was given", () => {
    const remote = resolveDatasource({ DATABASE_URL: REMOTE });

    expect(() => assertTargetAllowed(remote, false)).toThrow(/Refusing to run against a non-local database/);
    expect(() => assertTargetAllowed(remote, true)).not.toThrow();
  });

  it("judges the host the driver will really connect to", () => {
    const redirected = resolveDatasource({ DATABASE_URL: `${DEV}?host=db.example.com` });

    expect(redirected).toMatchObject({ local: false, connection: { host: "db.example.com" } });
    expect(() => assertTargetAllowed(redirected, false)).toThrow(DatasourceError);
  });

  it("follows a port override in the query string, as pg does", () => {
    expect(resolveDatasource({ DATABASE_URL: `${TEST}?port=37987` }).connection).toMatchObject({ port: 37987 });
  });
});
