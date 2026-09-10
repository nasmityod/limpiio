/**
 * <JsonLd> — script reutilizable de datos estructurados (Schema.org).
 *
 * • Serializa el objeto y escapa `<` para impedir cierre prematuro de la
 *   etiqueta `</script>` si algún dato editable (descripciones de producto,
 *   reseñas) contiene HTML.
 * • Acepta `nonce` opcional para la CSP del middleware.
 *
 * PRD-284 — decisión de la sesión de Seguridad (resuelve la DEPENDENCIA-01):
 * los JSON-LD de páginas ISR (product/categoria, revalidate=300) se emiten
 * SIN nonce a propósito. Un nonce por request es incompatible con HTML
 * cacheado (el nonce "congelado" nunca coincidiría con la cabecera CSP de la
 * request) y leer headers() en esas páginas las volvería dinámicas, rompiendo
 * el caché (conflicto directo con la estrategia ISR del segmento 03-INFRA).
 * Impacto real: la CSP solo gobierna EJECUCIÓN de scripts y los bloques
 * `application/ld+json` son datos no ejecutables — el único efecto es un
 * aviso en DevTools; Googlebot lee el HTML estático sin problema. Las rutas
 * dinámicas (layout) SÍ pasan nonce.
 *
 * Uso: <JsonLd data={schema} /> ó <JsonLd data={[schemaA, schemaB]} />
 */

type JsonLdObject = Record<string, unknown>;

interface JsonLdProps {
  data: JsonLdObject | JsonLdObject[];
  nonce?: string;
}

export default function JsonLd({ data, nonce }: JsonLdProps) {
  const items = Array.isArray(data) ? data : [data];

  return (
    <>
      {items.map((item, i) => (
        <script
          key={i}
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(item).replace(/</g, '\\u003c'),
          }}
        />
      ))}
    </>
  );
}
