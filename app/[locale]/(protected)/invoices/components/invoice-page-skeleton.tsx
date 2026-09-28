import { Skeleton } from "@/components/ui/skeleton";

const PLACEHOLDER_LINES = [0, 1, 2];

export function InvoicePageSkeleton() {
  return (
    <div aria-hidden className="flex w-full max-w-5xl flex-col gap-6 p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-6 w-48" />

        <Skeleton className="h-8 w-32" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-32" />

        <Skeleton className="h-32" />
      </div>

      <div className="flex flex-col gap-2">
        {PLACEHOLDER_LINES.map((index) => (
          <Skeleton key={index} className="h-10" />
        ))}
      </div>

      <Skeleton className="ml-auto h-20 w-64" />
    </div>
  );
}
