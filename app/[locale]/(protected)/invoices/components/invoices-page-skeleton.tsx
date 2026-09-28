import { Skeleton } from "@/components/ui/skeleton";

const PLACEHOLDER_ROWS = [0, 1, 2, 3, 4, 5];

export function InvoicesPageSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 p-4 md:p-6">
      <Skeleton className="h-6 w-40" />

      <Skeleton className="h-4 w-80 max-w-full" />

      <Skeleton className="h-8 w-96 max-w-full" />

      <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {PLACEHOLDER_ROWS.map((index) => (
          <div key={index} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="h-4 w-24" />

            <Skeleton className="h-4 flex-1" />

            <Skeleton className="h-4 w-20" />

            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
