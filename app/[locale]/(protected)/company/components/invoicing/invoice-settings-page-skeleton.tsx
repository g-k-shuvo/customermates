import { SettingsFieldSkeleton, SettingsFormSkeleton } from "@/components/forms/settings-form-skeleton";

const FIELDS = [0, 1, 2, 3, 4, 5, 6];

export function InvoiceSettingsPageSkeleton({ animated = true }: { animated?: boolean }) {
  return (
    <SettingsFormSkeleton data-invoice-settings-page-skeleton animated={animated}>
      {FIELDS.map((field) => (
        <SettingsFieldSkeleton key={field} animated={animated} short={field % 3 === 2} />
      ))}
    </SettingsFormSkeleton>
  );
}
