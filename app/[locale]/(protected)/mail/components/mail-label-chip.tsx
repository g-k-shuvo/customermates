import type { MailThreadLabelDto } from "@/features/mailbox/mailbox.schema";

import { Badge } from "@/components/ui/badge";

export function MailLabelChip({ label }: { label: MailThreadLabelDto }) {
  return (
    <Badge className="max-w-40" data-mail-label={label.id} variant={label.color}>
      <span className="truncate">{label.name}</span>
    </Badge>
  );
}
