import { type TaskDto } from "../task.schema";

export abstract class UncompleteTaskRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<TaskDto>;
  abstract uncompleteTaskOrThrow(id: string): Promise<TaskDto | null>;
}
