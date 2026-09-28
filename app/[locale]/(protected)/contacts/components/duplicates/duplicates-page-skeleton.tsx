import { Skeleton } from "@/components/ui/skeleton";

const PLACEHOLDER_GROUPS = [0, 1, 2];

export function DuplicatesPageSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4 p-4 md:p-6">
      <Skeleton className="h-6 w-48" />

      <Skeleton className="h-4 w-80 max-w-full" />

      {PLACEHOLDER_GROUPS.map((index) => (
        <div key={index} className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <Skeleton className="h-4 w-40" />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Skeleton className="h-28" />

            <Skeleton className="h-28" />
          </div>
        </div>
      ))}
    </div>
  );
}
