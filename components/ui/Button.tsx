import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Sistema de botones MundoTech.
 *
 * Variantes:
 *  - primary    → CTA principal, navy s lido (uso general).
 *  - accent     → CTA destacado, amarillo de marca.
 *  - secondary  → outline navy.
 *  - subtle     → fondo slate suave.
 *  - ghost      → solo texto.
 *  - destructive→ acciones peligrosas.
 *  - link       → enlace tipogr fico.
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none",
    "font-semibold tracking-tight",
    "transition-all duration-200 ease-out",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white",
    "disabled:pointer-events-none disabled:opacity-50",
    "active:scale-[0.98]",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-navy text-white shadow-soft hover:shadow-card hover:-translate-y-0.5 hover:bg-navy-700",
        accent:
          "bg-brand-yellow text-navy shadow-soft hover:shadow-card hover:-translate-y-0.5 hover:bg-[#FFE03A]",
        secondary:
          "border border-navy/15 bg-white text-navy shadow-soft hover:border-navy hover:shadow-card",
        subtle:
          "bg-slate-100 text-navy hover:bg-slate-200/80",
        ghost:
          "text-navy hover:bg-slate-100",
        destructive:
          "bg-rose-600 text-white shadow-soft hover:bg-rose-700 hover:shadow-card",
        link:
          "text-navy underline-offset-4 hover:underline p-0 h-auto",

        // Aliases (retrocompat con c digo viejo)
        default: "bg-navy text-white shadow-soft hover:shadow-card hover:-translate-y-0.5 hover:bg-navy-700",
        action:  "bg-navy text-white shadow-soft hover:shadow-card hover:-translate-y-0.5 hover:bg-navy-700",
        outline: "border border-navy/15 bg-white text-navy shadow-soft hover:border-navy hover:shadow-card",
      },
      size: {
        sm:      "h-9 px-3.5 text-xs rounded-lg",
        md:      "h-11 px-5 text-sm rounded-xl",
        lg:      "h-12 px-7 text-[15px] rounded-xl",
        xl:      "h-14 px-8 text-base rounded-2xl",
        icon:    "h-10 w-10 rounded-xl",
        // Aliases
        default: "h-11 px-5 text-sm rounded-xl",
      },
      pill: {
        true:  "rounded-full",
        false: "",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
      pill: false,
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, pill, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, pill, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
