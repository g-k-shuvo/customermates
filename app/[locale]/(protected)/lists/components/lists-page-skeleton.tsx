import { Skeleton } from "@/components/ui/skeleton";

const PLACEHOLDER_ROWS = [0, 1, 2, 3, 4];

export function ListsPageSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 p-4 md:p-6">
      <Skeleton className="h-6 w-40" />

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {PLACEHOLDER_ROWS.map((index) => (
            <div key={index} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 flex-1" />

              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <Skeleton className="h-5 w-56" />

          <Skeleton className="h-4 w-80 max-w-full" />

          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}
