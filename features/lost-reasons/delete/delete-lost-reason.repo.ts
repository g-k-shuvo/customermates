import { type LostReasonDto } from "../lost-reason.schema";

export abstract class DeleteLostReasonRepo {
  abstract deleteLostReasonOrThrow(id: string): Promise<LostReasonDto>;
  abstract countDealsWithLostReason(lostReasonId: string): Promise<number>;
}
