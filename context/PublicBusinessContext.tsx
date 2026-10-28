'use client';
import { createContext, useContext, type ReactNode } from 'react';

export type PublicBusiness = { address: string; phone: string };
const PublicBusinessContext = createContext<PublicBusiness>({ address: '', phone: '' });
export function PublicBusinessProvider({ value, children }: { value: PublicBusiness; children: ReactNode }) {
  return <PublicBusinessContext.Provider value={value}>{children}</PublicBusinessContext.Provider>;
}
export const usePublicBusiness = () => useContext(PublicBusinessContext);
