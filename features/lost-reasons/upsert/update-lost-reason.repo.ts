import { type LostReasonDto } from "../lost-reason.schema";

import { type UpdateLostReasonData } from "./update-lost-reason.interactor";

export abstract class UpdateLostReasonRepo {
  abstract updateLostReasonOrThrow(args: UpdateLostReasonData): Promise<LostReasonDto>;
}
