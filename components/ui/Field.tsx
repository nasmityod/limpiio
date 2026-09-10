import * as React from "react"
import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface FieldProps {
  /** id del input para enlazar label */
  id: string
  /** Texto del label */
  label: string
  /** Helper text neutro (debajo del input) */
  hint?: string
  /** Mensaje de error (anula hint) */
  error?: string
  /** Marca el campo como opcional con etiqueta peque a a la derecha del label */
  optional?: boolean
  /** Slot izquierdo (icono dentro del input) */
  leading?: React.ReactNode
  /** Slot derecho (toggle visibilidad, etc.) */
  trailing?: React.ReactNode
  className?: string
  children: React.ReactNode
}

/**
 * Wrapper unificado para campos de formulario:
 *
 *   <Field id="email" label="Correo" leading={<Mail/>} error={err}>
 *     <Input id="email" type="email" />
 *   </Field>
 *
 * El padding del Input lo ajusta el dev seg n los slots (`pl-10`, `pr-10`, etc.).
 */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  leading,
  trailing,
  className,
  children,
}: FieldProps) {
  const helperId = error ? `${id}-error` : hint ? `${id}-hint` : undefined

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-1.5">
        <label
          htmlFor={id}
          className="block text-[12px] font-semibold text-navy tracking-tight"
        >
          {label}
        </label>
        {optional && (
          <span className="text-[11px] text-slate-400 font-medium">opcional</span>
        )}
      </div>

      <div className="relative">
        {leading && (
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
            {leading}
          </span>
        )}
        {children}
        {trailing && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            {trailing}
          </span>
        )}
      </div>

      {error ? (
        <p
          id={helperId}
          role="alert"
          className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600 font-medium"
        >
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={helperId} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export default Field
