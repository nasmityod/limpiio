/**
 * Aviso de descuento por pago en divisas.
 * Recibe enabled/percent desde el servidor (readSettings) — nunca lee env en cliente.
 */
export default function DivisaDiscountBanner({
  enabled,
  percent,
}: {
  enabled: boolean;
  percent: number;
}) {
  if (!enabled || !(percent > 0)) return null;

  return (
    <div
      role="status"
      className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 font-medium"
    >
      💵 Paga en divisas y ahorra {percent}% en tus productos
    </div>
  );
}
