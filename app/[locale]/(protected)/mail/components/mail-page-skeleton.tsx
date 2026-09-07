import { SkeletonShape as Shape } from "@/components/page-state/skeleton-shape";

const ROWS = Array.from({ length: 9 }, (_, index) => index);
const LINES = Array.from({ length: 6 }, (_, index) => index);

type Props = { animated?: boolean };

export function MailPageSkeleton({ animated = true }: Props) {
  return (
    <div className="flex size-full min-h-0 gap-4">
      <div className="flex min-h-0 w-full max-w-sm flex-col overflow-hidden rounded-lg border">
        {ROWS.map((row) => (
          <div key={row} className="flex min-h-16 flex-col gap-1.5 border-b p-3 last:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <Shape breathe animated={animated} className="h-3 w-2/5" motionPhase={1} />

              <Shape animated={animated} className="h-2.5 w-12" motionPhase={2} />
            </div>

            <Shape animated={animated} className="h-2.5 w-4/5" motionPhase={3} />
          </div>
        ))}
      </div>

      <div className="hidden min-h-0 flex-1 flex-col gap-4 rounded-lg border p-4 md:flex">
        <Shape animated={animated} className="h-4 w-1/3" />

        <Shape animated={animated} className="h-3 w-1/4" motionPhase={1} />

        <div className="flex flex-col gap-2 pt-4">
          {LINES.map((line) => (
            <Shape key={line} animated={animated} className="h-3 w-full" motionPhase={(line % 4) as 0 | 1 | 2 | 3} />
          ))}
        </div>
      </div>
    </div>
  );
}
