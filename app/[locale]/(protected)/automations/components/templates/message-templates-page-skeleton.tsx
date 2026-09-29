import { Skeleton } from "@/components/ui/skeleton";

const ROWS = [0, 1, 2, 3];

export function MessageTemplatesPageSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 p-4 md:p-6">
      <Skeleton className="h-6 w-48" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          {ROWS.map((row) => (
            <Skeleton key={row} className="h-12" />
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-9" />

          <Skeleton className="h-9" />

          <Skeleton className="h-48" />
        </div>
      </div>
    </div>
  );
}
