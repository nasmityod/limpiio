import NextAuth, { DefaultSession } from 'next-auth';
import { JWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id:           string;
      role:         string;
      /** RBAC: true si este usuario es el Superadmin. Solo para UX/barrera general.
       *  La autorización definitiva siempre se consulta en BD (lib/admin-access-server.ts). */
      isSuperAdmin: boolean;
    } & DefaultSession['user'];
  }

  interface User {
    id:    string;
    role?: string;
    /** Huella corta del hash de contraseña — invalida sesiones al cambiarla. */
    pwv?:  string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?:          string;
    role?:        string;
    /** Huella corta del hash de contraseña vigente (PRD-173/240). */
    pwv?:         string;
    /** Epoch ms de la última re-validación del JWT contra BD. */
    pwvAt?:       number;
    /** RBAC: copia del campo isSuperAdmin de BD. Solo para UX/barrera middleware.
     *  No usar para autorizar acciones sensibles — consultar la BD directamente. */
    isSuperAdmin?: boolean;
    /** RBAC: ISO timestamp del último cambio de permisos (para UX de actualización). */
    permissionsUpdatedAt?: string | null;
  }
}
