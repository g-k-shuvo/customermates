export abstract class DeleteWebFormSourceRepo {
  abstract deleteWebFormSourceOrThrow(id: string): Promise<string>;
}
