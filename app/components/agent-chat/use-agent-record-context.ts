"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { useRootStore } from "@/core/stores/root-store.provider";
import { AGENT_CONTEXT_RECORD_ENTITIES } from "@/ee/agent-chat/agent-context";
import type { EntityType } from "@/generated/prisma";

type AgentContextEntityType = (typeof AGENT_CONTEXT_RECORD_ENTITIES)[number];

function agentContextEntityType(entityType: EntityType | null): AgentContextEntityType | null {
  return AGENT_CONTEXT_RECORD_ENTITIES.includes(entityType as AgentContextEntityType)
    ? (entityType as AgentContextEntityType)
    : null;
}

export function useAgentRecordContext({
  enabled,
  entityType,
  recordId,
  name,
}: {
  enabled: boolean;
  entityType: EntityType | null;
  recordId: string | null;
  name: string | null;
}) {
  const pathname = usePathname();
  const { agentChatStore } = useRootStore();

  useEffect(() => {
    const contextEntityType = agentContextEntityType(entityType);
    if (!enabled || !agentChatStore || !contextEntityType || !recordId || !name) return;

    return agentChatStore.contextRegistry.register(pathname, () => [
      {
        context: {
          reference: { kind: "record", entityType: contextEntityType, recordId },
          label: name,
        },
        pageRoute: pathname,
      },
    ]);
  }, [agentChatStore, enabled, entityType, name, pathname, recordId]);
}
