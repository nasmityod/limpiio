/**
 * Declaración de tipos ambiental para `cashea-web-checkout-sdk@1.1.19`.
 *
 * El paquete no publica sus propios `.d.ts` (solo distribuye
 * `dist/webcheckout-sdk.min.js`, ver README del paquete). Se documentan aquí
 * únicamente los miembros usados por MundoTech
 * (`app/components/checkout/CasheaCheckoutButton.tsx`), tomados del README
 * oficial del SDK. No inventar métodos adicionales sin verificarlos contra
 * el paquete real.
 */
declare module 'cashea-web-checkout-sdk' {
  export interface CasheaCheckoutSdkProduct {
    id: string;
    name: string;
    sku: string;
    description: string;
    imageUrl: string;
    quantity: number;
    price: number;
    tax: number;
    discount: number;
  }

  export interface CasheaCheckoutSdkStore {
    id: number;
    name: string;
    enabled: boolean;
  }

  export interface CasheaCheckoutSdkPayload {
    identificationNumber: string;
    externalClientId: string;
    deliveryMethod: string;
    merchantName: string;
    redirectUrl: string;
    deliveryPrice: number;
    invoiceId?: string;
    orders: {
      store: CasheaCheckoutSdkStore;
      products: CasheaCheckoutSdkProduct[];
    }[];
  }

  export interface CasheaCheckoutSdkConfig {
    apiKey: string;
  }

  export interface CreateCheckoutButtonArgs {
    payload: CasheaCheckoutSdkPayload;
    container: HTMLElement;
  }

  export default class CheckoutSDK {
    constructor(config: CasheaCheckoutSdkConfig);
    createCheckoutButton(args: CreateCheckoutButtonArgs): void;
  }
}
