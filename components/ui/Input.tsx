import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Marca el input como con error (cambia borde y ring). */
  invalid?: boolean
  /** Tama o (sm | md | lg). Default md. */
  inputSize?: "sm" | "md" | "lg"
  /** Variante visual: solid (gris suave) o bordered (blanco). Default solid. */
  surface?: "solid" | "bordered"
}

const sizeMap: Record<NonNullable<InputProps["inputSize"]>, string> = {
  sm: "min-h-[40px] text-base px-3 rounded-lg",
  md: "min-h-[48px] text-base px-3.5 rounded-xl",
  lg: "min-h-[52px] text-base px-4 rounded-xl",
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, invalid, inputSize = "md", surface = "solid", ...props }, ref) => {
    const base = surface === "solid" ? "bg-slate-50/70" : "bg-white"

    return (
      <input
        type={type}
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "block w-full text-navy placeholder:text-slate-400",
          "border outline-none transition-all duration-150",
          "focus:bg-white focus:shadow-ring-navy",
          base,
          sizeMap[inputSize],
          invalid
            ? "border-rose-400 focus:border-rose-500 focus:shadow-[0_0_0_4px_rgba(225,29,72,0.12)]"
            : "border-slate-200 focus:border-navy",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        {...props}
      />
    )
  },
)
Input.displayName = "Input"

export { Input }
