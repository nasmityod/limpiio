import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface SectionHeaderProps {
  /** Texto pequeño en mayúsculas arriba del título (categoría/badge). */
  eyebrow?: string
  /** Título principal de la sección. */
  title: string
  /** Subtítulo descriptivo opcional. */
  subtitle?: string
  /** Link "ver todo" alineado a la derecha en desktop. */
  actionHref?: string
  /** Texto del CTA derecho. */
  actionLabel?: string
  /** Tono del eyebrow. */
  eyebrowTone?: "navy" | "yellow" | "rose" | "emerald" | "sky"
  /** Tamaño del título: md (text-2xl) | lg (text-3xl) | xl (text-4xl). */
  size?: "md" | "lg" | "xl"
  /** Quita el márgen inferior por defecto. */
  className?: string
}

const eyebrowTones: Record<NonNullable<SectionHeaderProps["eyebrowTone"]>, string> = {
  navy:    "text-navy/60",
  yellow:  "text-amber-600",
  rose:    "text-rose-600",
  emerald: "text-emerald-600",
  sky:     "text-sky-600",
}

const titleSizes: Record<NonNullable<SectionHeaderProps["size"]>, string> = {
  md: "text-2xl md:text-[1.75rem]",
  lg: "text-3xl md:text-[2rem]",
  xl: "text-3xl md:text-4xl lg:text-[2.5rem]",
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  actionHref,
  actionLabel = "Ver todo",
  eyebrowTone = "navy",
  size = "lg",
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 mb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="max-w-2xl">
        {eyebrow && (
          <p
            className={cn(
              "text-[11px] font-semibold uppercase tracking-[0.2em] mb-2",
              eyebrowTones[eyebrowTone],
            )}
          >
            {eyebrow}
          </p>
        )}
        <h2
          className={cn(
            "font-bold text-navy tracking-tight text-balance leading-[1.05]",
            titleSizes[size],
          )}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2.5 text-[15px] text-slate-500 leading-relaxed text-pretty">
            {subtitle}
          </p>
        )}
      </div>

      {actionHref && (
        <Link
          href={actionHref}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 text-sm font-semibold text-navy/80 hover:text-navy group transition-colors whitespace-nowrap"
        >
          {actionLabel}
          <ArrowRight
            size={15}
            className="transition-transform duration-200 group-hover:translate-x-1"
          />
        </Link>
      )}
    </div>
  )
}

export default SectionHeader
