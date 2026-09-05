import { type LostReasonDto } from "../lost-reason.schema";

import { type CreateLostReasonData } from "./create-lost-reason.interactor";

export abstract class CreateLostReasonRepo {
  abstract createLostReasonOrThrow(args: CreateLostReasonData): Promise<LostReasonDto>;
}
