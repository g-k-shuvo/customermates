/**
 * The write path into Customermates. Every mutation goes through the public REST
 * API (`/api/v1/...`) so validation, domain events and tenant scoping all apply —
 * the migration never touches Prisma.
 *
 * Custom columns are the one exception: there is no REST route for them, so the
 * script calls the `manage_custom_columns` MCP tool on `/api/v1/mcp`, which is the
 * same interactor behind the same `x-api-key` credential.
 */

import type { CustomColumnType, EntityType } from "@/generated/prisma";

export type CrmCustomColumn = {
  id: string;
  label: string;
  type: CustomColumnType;
  entityType: EntityType;
};

export type CrmCustomFieldValue = { columnId: string; value: string | null };

export type CrmRecord = {
  id: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  notes?: unknown;
  status?: string;
  stageId?: string | null;
  pipelineId?: string | null;
  customFieldValues: CrmCustomFieldValue[];
};

export type CrmUser = { id: string; email: string; firstName: string; lastName: string };

export type CrmStage = { id: string; name: string; position: number; kind: string };

export type CrmPipeline = { id: string; name: string; position: number; stages: CrmStage[] };

export type CrmLostReason = { id: string; name: string; position: number };

export type CrmService = { id: string; name: string; amount: number };

/** The read surface `runMigration` depends on; `CrmClient` is its live implementation. */
export type CrmReads = {
  users(): Promise<CrmUser[]>;
  pipelines(): Promise<CrmPipeline[]>;
  lostReasons(): Promise<CrmLostReason[]>;
  services(): Promise<CrmService[]>;
  customColumns(entityPath: string): Promise<CrmCustomColumn[]>;
  searchAll<T>(entityPath: string, filters?: unknown[]): Promise<T[]>;
};

export class CrmApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(`${method} ${path} failed with ${status}: ${body}`);
  }
}

type SearchResponse<T> = { items: T[]; pagination?: { total?: number; totalPages?: number } };

const SEARCH_PAGE_SIZE = 100;

export class CrmClient {
  private mcpSessionId: string | null = null;
  private mcpInitialized = false;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  private get headers(): Record<string, string> {
    return { "content-type": "application/json", "x-api-key": this.apiKey };
  }

  async request<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const text = await response.text();
    if (!response.ok) throw new CrmApiError(method, path, response.status, text.slice(0, 800));

    return (text === "" ? null : JSON.parse(text)) as T;
  }

  /** Pages a `/search` endpoint to exhaustion, 100 records at a time. */
  async searchAll<T>(entityPath: string, filters: unknown[] = []): Promise<T[]> {
    const collected: T[] = [];

    for (let page = 1; ; page += 1) {
      const response = await this.request<SearchResponse<T>>("POST", `/api/v1/${entityPath}/search`, {
        ...(filters.length > 0 ? { filters } : {}),
        pagination: { page, pageSize: SEARCH_PAGE_SIZE },
      });

      collected.push(...response.items);

      const totalPages = response.pagination?.totalPages ?? 1;
      if (response.items.length < SEARCH_PAGE_SIZE || page >= totalPages) return collected;
    }
  }

  async whoami(): Promise<CrmUser> {
    return await this.request<CrmUser>("GET", "/api/v1/users/me");
  }

  async users(): Promise<CrmUser[]> {
    return await this.searchAll<CrmUser>("users");
  }

  async pipelines(): Promise<CrmPipeline[]> {
    return await this.request<CrmPipeline[]>("GET", "/api/v1/pipelines");
  }

  async createPipeline(payload: unknown): Promise<CrmPipeline> {
    return await this.request<CrmPipeline>("POST", "/api/v1/pipelines", payload);
  }

  async createStage(pipelineId: string, payload: unknown): Promise<CrmStage> {
    return await this.request<CrmStage>("POST", `/api/v1/pipelines/${pipelineId}/stages`, payload);
  }

  async lostReasons(): Promise<CrmLostReason[]> {
    return await this.request<CrmLostReason[]>("GET", "/api/v1/lost-reasons");
  }

  async createLostReason(payload: unknown): Promise<CrmLostReason> {
    return await this.request<CrmLostReason>("POST", "/api/v1/lost-reasons", payload);
  }

  async services(): Promise<CrmService[]> {
    return await this.searchAll<CrmService>("services");
  }

  async createService(payload: unknown): Promise<CrmService> {
    return await this.request<CrmService>("POST", "/api/v1/services", payload);
  }

  async customColumns(entityPath: string): Promise<CrmCustomColumn[]> {
    const configuration = await this.request<{ customColumns?: CrmCustomColumn[] }>(
      "GET",
      `/api/v1/${entityPath}/configuration`,
    );

    return configuration.customColumns ?? [];
  }

  async createRecord(entityPath: string, payload: unknown): Promise<CrmRecord> {
    return await this.request<CrmRecord>("POST", `/api/v1/${entityPath}`, payload);
  }

  async updateRecord(entityPath: string, id: string, payload: unknown): Promise<CrmRecord> {
    return await this.request<CrmRecord>("PUT", `/api/v1/${entityPath}/${id}`, payload);
  }

  async markDealWon(id: string): Promise<CrmRecord> {
    return await this.request<CrmRecord>("POST", `/api/v1/deals/${id}/won`);
  }

  async markDealLost(id: string, payload: { lostReasonId: string; lostNotes?: string }): Promise<CrmRecord> {
    return await this.request<CrmRecord>("POST", `/api/v1/deals/${id}/lost`, payload);
  }

  async reopenDeal(id: string, stageId?: string): Promise<CrmRecord> {
    return await this.request<CrmRecord>(
      "POST",
      `/api/v1/deals/${id}/reopen`,
      stageId === undefined ? {} : { stageId },
    );
  }

  /**
   * There is no REST route for custom columns, so this drives the same interactor
   * through the MCP endpoint. Only the `custom-columns` toolset is requested.
   */
  async createCustomColumn(input: {
    entityType: EntityType;
    type: CustomColumnType;
    label: string;
    selectOptions?: { label: string }[];
    options?: Record<string, unknown>;
  }): Promise<void> {
    await this.callMcpTool("manage_custom_columns", {
      action: "upsert",
      intent: "create",
      entityType: input.entityType,
      type: input.type,
      label: input.label,
      ...(input.selectOptions ? { selectOptions: input.selectOptions } : {}),
      ...(input.options ? { options: input.options } : {}),
    });
  }

  private async postMcp(payload: unknown): Promise<{ body: string; sessionId: string | null }> {
    const response = await fetch(`${this.baseUrl}/api/v1/mcp?toolsets=custom-columns`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        "x-api-key": this.apiKey,
        ...(this.mcpSessionId ? { "mcp-session-id": this.mcpSessionId } : {}),
      },
      body: JSON.stringify(payload),
    });

    const body = await response.text();
    if (!response.ok) throw new CrmApiError("POST", "/api/v1/mcp", response.status, body.slice(0, 800));

    return { body, sessionId: response.headers.get("mcp-session-id") };
  }

  /** The MCP transport answers with either plain JSON or a one-message SSE stream. */
  static parseMcpBody(body: string): Record<string, unknown> | null {
    const text = body.trim();
    if (text === "") return null;
    if (text.startsWith("{")) return JSON.parse(text) as Record<string, unknown>;

    const payloads = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter((line) => line !== "" && line !== "[DONE]");

    const last = payloads.at(-1);

    return last === undefined ? null : (JSON.parse(last) as Record<string, unknown>);
  }

  private async ensureMcpSession(): Promise<void> {
    if (this.mcpInitialized) return;

    const initialize = await this.postMcp({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "migrate-pipedrive", version: "1.0.0" },
      },
    });

    this.mcpSessionId = initialize.sessionId;
    this.mcpInitialized = true;

    await this.postMcp({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  private async callMcpTool(name: string, args: Record<string, unknown>): Promise<void> {
    await this.ensureMcpSession();

    const response = await this.postMcp({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name, arguments: args },
    });

    const parsed = CrmClient.parseMcpBody(response.body);
    if (!parsed) return;

    const error = parsed.error as { message?: string } | undefined;
    if (error) throw new Error(`MCP ${name} failed: ${error.message ?? "unknown error"}`);

    const result = parsed.result as { isError?: boolean; content?: { text?: string }[] } | undefined;
    if (result?.isError === true)
      throw new Error(`MCP ${name} failed: ${result.content?.[0]?.text ?? "unknown error"}`);
  }
}
