import { type WebFormSourceWithSecret } from "../webform-source.schema";

export abstract class RotateWebFormSecretRepo {
  abstract rotateWebFormSecretOrThrow(id: string): Promise<WebFormSourceWithSecret>;
}
