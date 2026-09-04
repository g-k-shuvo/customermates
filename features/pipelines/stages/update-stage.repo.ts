import { type PipelineStageDto } from "../pipeline.schema";

import { type UpdateStageData } from "./update-stage.interactor";

export abstract class UpdateStageRepo {
  abstract updateStageOrThrow(args: UpdateStageData): Promise<PipelineStageDto>;
}
