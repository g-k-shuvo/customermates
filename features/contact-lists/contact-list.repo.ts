import type { ContactListDto, ContactListMembersDto } from "./contact-list.schema";

export abstract class ContactListRepo {
  abstract findListsCompanyWide(): Promise<ContactListDto[]>;
  abstract findListOrNull(id: string): Promise<ContactListDto | null>;
  abstract listNameTaken(name: string, exceptId: string | null): Promise<boolean>;
  abstract createList(args: { name: string; description: string | null }): Promise<ContactListDto>;
  abstract updateList(args: { id: string; name: string; description: string | null }): Promise<void>;
  abstract deleteList(id: string): Promise<void>;
  abstract findMembers(id: string, page: number, pageSize: number): Promise<ContactListMembersDto>;
  abstract findAccessibleContactIds(contactIds: string[]): Promise<string[]>;
  abstract addMembers(listId: string, contactIds: string[], jobId: string | null): Promise<number>;
  abstract removeMembers(listId: string, contactIds: string[]): Promise<number>;
}
