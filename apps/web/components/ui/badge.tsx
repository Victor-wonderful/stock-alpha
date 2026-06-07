import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded font-medium leading-none ring-1 ring-inset whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-surface-3 text-text-dim ring-border-strong",
        style: "bg-sky-500/10 text-sky-300 ring-sky-500/25",
        setup: "bg-violet-500/10 text-violet-300 ring-violet-500/25",
        session: "bg-amber-500/10 text-amber-300 ring-amber-500/25",
        bull: "bg-bull/12 text-bull ring-bull/25",
        bear: "bg-bear/12 text-bear ring-bear/25",
        accent: "bg-accent/12 text-accent ring-accent/30",
        warn: "bg-warn/10 text-warn ring-warn/30",
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
