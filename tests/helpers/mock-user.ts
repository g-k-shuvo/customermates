import type { TenantUser } from "@/features/user/user.schema";

import { Status, CountryCode, Locale, Theme, Resource, Action } from "@/generated/prisma";

const PIPELINE_PERMISSIONS = [
  { id: "perm-pipelines-create", resource: Resource.pipelines, action: Action.create },
  { id: "perm-pipelines-read-all", resource: Resource.pipelines, action: Action.readAll },
  { id: "perm-pipelines-read-own", resource: Resource.pipelines, action: Action.readOwn },
  { id: "perm-pipelines-update", resource: Resource.pipelines, action: Action.update },
  { id: "perm-pipelines-delete", resource: Resource.pipelines, action: Action.delete },
];

const MOCK_ROLE = {
  id: "test-role-id",
  name: "Admin",
  description: null,
  isSystemRole: true,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  permissions: [...PIPELINE_PERMISSIONS],
} satisfies NonNullable<TenantUser["role"]>;

const BASE_MOCK_USER = {
  id: "test-user-id",
  email: "test@example.com",
  firstName: "Test",
  lastName: "User",
  companyId: "test-company-id",
  roleId: MOCK_ROLE.id,
  status: Status.active,
  displayLanguage: Locale.en,
  formattingLocale: Locale.en,
  theme: Theme.system,
  country: CountryCode.de,
  avatarUrl: null,
  agreeToTerms: true,
  lastActiveAt: new Date(0),
  onboardingWizardCompletedAt: new Date(0),
  createdAt: new Date(0),
  updatedAt: new Date(0),
  role: MOCK_ROLE,
} satisfies TenantUser;

export function createMockUser(overrides: Partial<TenantUser> = {}): TenantUser {
  return { ...BASE_MOCK_USER, ...overrides };
}

export function createMockUserWithPermissions(permissions: Array<{ resource: Resource; action: Action }>): TenantUser {
  return createMockUser({
    role: {
      ...MOCK_ROLE,
      name: "Custom",
      isSystemRole: false,
      permissions: permissions.map((permission, index) => ({ id: `perm-${index}`, ...permission })),
    },
  });
}
