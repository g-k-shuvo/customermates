import { type TaskDto } from "../task.schema";

export abstract class CompleteTaskRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<TaskDto>;
  abstract completeTaskOrThrow(id: string): Promise<TaskDto | null>;
}
