/**
 * checkout-error.ts
 * Error de negocio del checkout (PRD-029/070): mensaje seguro para el cliente
 * + status HTTP. Todo lo que NO sea CheckoutError se trata como error interno
 * (500) y nunca se expone su mensaje al navegador.
 */
export class CheckoutError extends Error {
  readonly httpStatus: number;

  constructor(message: string, httpStatus = 400) {
    super(message);
    this.name = 'CheckoutError';
    this.httpStatus = httpStatus;
  }
}
