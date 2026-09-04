import type { PipelineDto } from "./pipeline.schema";

export abstract class GetCompanyWidePipelineRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<PipelineDto>;
  abstract getManyOrThrowCompanyWide(ids: string[]): Promise<PipelineDto[]>;
}
