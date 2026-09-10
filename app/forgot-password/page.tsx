import type { Metadata } from 'next';
import ForgotPasswordClient from './ForgotPasswordClient';

export const metadata: Metadata = {
  title: 'Recuperar contraseña',
  description:
    'Solicita un enlace para restablecer tu contraseña en MundoTech. El enlace es válido por 15 minutos.',
  // P96/H61: página fina de auth — fuera del índice, canonical propio.
  alternates: { canonical: '/forgot-password' },
  robots: { index: false, follow: true },
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />;
}
