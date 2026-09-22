import { type WebFormSourceWithSecret } from "../webform-source.schema";

import { type CreateWebFormSourceData } from "./create-web-form-source.interactor";

export abstract class CreateWebFormSourceRepo {
  abstract createWebFormSourceOrThrow(args: CreateWebFormSourceData): Promise<WebFormSourceWithSecret>;
  abstract slugExists(slug: string): Promise<boolean>;
}
