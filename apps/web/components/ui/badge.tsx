import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded font-medium leading-none ring-1 ring-inset whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-surface-3 text-text-dim ring-border-strong",
        style: "bg-sky-500/10 text-sky-700 ring-sky-500/25",
        setup: "bg-violet-500/10 text-violet-700 ring-violet-500/25",
        session: "bg-amber-500/10 text-amber-700 ring-amber-500/25",
        bull: "bg-bull-soft text-bull ring-bull/20",
        bear: "bg-bear-soft text-bear ring-bear/20",
        accent: "bg-accent-dim text-accent ring-accent/25",
        warn: "bg-warn-soft text-warn ring-warn/25",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[10px]",
        md: "px-2 py-0.5 text-2xs",
      },
    },
    defaultVariants: { variant: "neutral", size: "sm" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}
