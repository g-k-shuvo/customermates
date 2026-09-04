import { type PipelineDto } from "../pipeline.schema";

import { type CreatePipelineData } from "./create-pipeline.interactor";

export abstract class CreatePipelineRepo {
  abstract createPipelineOrThrow(args: CreatePipelineData): Promise<PipelineDto>;
  abstract demoteDefaultPipelinesExcept(pipelineId: string | null): Promise<void>;
}
