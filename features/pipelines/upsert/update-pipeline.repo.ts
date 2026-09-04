import { type PipelineDto } from "../pipeline.schema";

import { type UpdatePipelineData } from "./update-pipeline.interactor";

export abstract class UpdatePipelineRepo {
  abstract updatePipelineOrThrow(args: UpdatePipelineData): Promise<PipelineDto>;
  abstract demoteDefaultPipelinesExcept(pipelineId: string | null): Promise<void>;
  abstract getOrThrowCompanyWide(id: string): Promise<PipelineDto>;
}
