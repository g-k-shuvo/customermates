import { type PipelineStageDto } from "../pipeline.schema";

import { type CreateStageData } from "./create-stage.interactor";

export abstract class CreateStageRepo {
  abstract createStageOrThrow(args: CreateStageData): Promise<PipelineStageDto>;
}
