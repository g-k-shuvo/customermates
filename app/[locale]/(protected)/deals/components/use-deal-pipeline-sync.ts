"use client";

import type { DealsStore } from "./deals.store";
import type { PipelineDto } from "@/features/pipelines/pipeline.schema";

import { useEffect } from "react";

export function useDealPipelineSync(store: DealsStore, pipelines: PipelineDto[]): void {
  useEffect(() => {
    store.setPipelineCatalog(pipelines);
    store.seedDefaultStatusFilter();
  }, [store, pipelines]);
}
