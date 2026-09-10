import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1 font-semibold tracking-tight whitespace-nowrap",
  {
    variants: {
      variant: {
        new:        "bg-navy text-white",
        sale:       "bg-rose-600 text-white",
        soft:       "bg-brand-yellowSft text-navy",
        solid:      "bg-brand-yellow text-navy",
        outline:    "border border-slate-200 bg-white text-navy",
        success:    "bg-emerald-50 text-emerald-700 border border-emerald-100",
        warning:    "bg-amber-50 text-amber-700 border border-amber-100",
        danger:     "bg-rose-50 text-rose-700 border border-rose-100",
        info:       "bg-sky-50 text-sky-700 border border-sky-100",
        neutral:    "bg-slate-100 text-slate-600",
      },
      size: {
        sm: "text-[10px] px-2 py-0.5 rounded-full",
        md: "text-[11px] px-2.5 py-1 rounded-full",
        lg: "text-xs px-3 py-1.5 rounded-full",
      },
    },
    defaultVariants: { variant: "neutral", size: "md" },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
}

export { badgeVariants }
