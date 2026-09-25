import { Button } from "@react-email/components";

import { cn } from "@/core/utils/cn";

type Props = {
  href: string;
  children: string;
  className?: string;
};

export function EmailButton({ href, children, className }: Props) {
  return (
    <Button
      className={cn(
        "rounded-lg px-5 py-3 bg-primary-400 hover:bg-primary-500 active:bg-primary-600 text-white no-underline inline-block text-center text-sm font-medium leading-none",
        className,
      )}
      href={href}
    >
      {children}
    </Button>
  );
}
