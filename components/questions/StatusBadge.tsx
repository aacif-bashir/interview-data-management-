import { cn } from "@/lib/utils";
import { STATUS_LABELS, type QuestionStatus } from "@/types";

const STYLES: Record<QuestionStatus, { pill: string; dot: string }> = {
  not_studied: {
    pill: "bg-muted text-muted-foreground",
    dot: "bg-muted-foreground/50",
  },
  learning: {
    pill: "bg-amber-500/12 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  mastered: {
    pill: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
};

/** Notion-style status pill with a colored dot. */
export function StatusBadge({
  status,
  className,
}: {
  status: QuestionStatus;
  className?: string;
}) {
  const s = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        s.pill,
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full", s.dot)} />
      {STATUS_LABELS[status]}
    </span>
  );
}
