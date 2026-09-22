import { type WebFormSourceDto } from "../webform-source.schema";

import { type UpdateWebFormSourceData } from "./update-web-form-source.interactor";

export abstract class UpdateWebFormSourceRepo {
  abstract updateWebFormSourceOrThrow(args: UpdateWebFormSourceData): Promise<WebFormSourceDto>;
  abstract getWebFormSourceOrThrowCompanyWide(id: string): Promise<WebFormSourceDto>;
}
