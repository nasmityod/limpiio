/**
 * FASE 3 (SEO): preguntas frecuentes de la ficha de producto — contenido REAL
 * de la operación de la tienda (pagos, envíos, garantía, tienda física), no
 * texto de relleno. Se muestra en la pestaña "Envío" del PDP y se emite como
 * FAQPage JSON-LD (el contenido visible y el schema son el mismo objeto — R1:
 * los datos vivos llegan por parámetro desde readSettings()).
 */

export interface ProductFaqItem {
  question: string;
  answer: string;
}

export function buildProductFaq(params: {
  productName: string;
  storeAddress: string;
  storePhone: string;
}): ProductFaqItem[] {
  const { productName, storeAddress, storePhone } = params;
  return [
    {
      question: `¿${productName} tiene garantía?`,
      answer:
        'Sí: 7 días de garantía de tienda en electrónica general (no aplica a electrónica para vehículos ni a productos no electrónicos). Para hacerla válida conserva tu factura y la caja original.',
    },
    {
      question: '¿Cómo puedo pagar desde Venezuela?',
      answer:
        'Aceptamos Pago Móvil y transferencia bancaria en bolívares (a tasa BCV del día), Binance (USDT) y Cashea. El precio se muestra en USD y su equivalente en Bs.',
    },
    {
      question: '¿Hacen envíos a todo el país?',
      answer:
        'Sí. Enviamos por MRW, Zoom y Tealca a toda Venezuela con cobro a destino (pagas el flete al recibir en la oficina). En Barquisimeto también puedes retirar gratis en la tienda.',
    },
    {
      question: '¿Puedo ver el producto antes de comprar?',
      answer: `Claro: somos tienda física en Barquisimeto — ${storeAddress}. También te atendemos por WhatsApp al ${storePhone}.`,
    },
  ];
}
