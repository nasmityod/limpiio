import NextAuth, { type AuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcrypt';
import type { JWT } from 'next-auth/jwt';
import type { Session } from 'next-auth';
import { rateLimitCritical, getClientIp, hashForBucket } from '@/lib/rate-limit';
import { buildRateLimitedResponse } from '@/lib/security';
import { logError } from '@/lib/safe-logger';

const googleId     = process.env.GOOGLE_CLIENT_ID;
const googleSecret = process.env.GOOGLE_CLIENT_SECRET;

/**
 * Huella corta (no reversible) del hash bcrypt almacenado. Viaja en el JWT
 * (`token.pwv`) y permite invalidar TODAS las sesiones de un usuario cuando
 * su contraseña cambia (reset propio, cambio en cuenta o reset por un admin)
 * sin necesitar campos nuevos en BD (PRD-173 / PRD-240).
 */
function passwordFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}

/** Cada cuánto re-validar el JWT contra la BD (rol, email, contraseña vigente). */
const JWT_REVALIDATE_MS = 5 * 60_000;

export const authOptions: AuthOptions = {
  providers: [
    ...(googleId && googleSecret
      ? [
          GoogleProvider({
            clientId:     googleId,
            clientSecret: googleSecret,
          }),
        ]
      : []),
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email:    { label: 'Email',    type: 'email'    },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        // PRD-237: normalizar el email en el lookup — sin esto, un usuario
        // registrado como user@mail.com no puede entrar tecleando User@mail.com
        // (UNIQUE case-sensitive en PostgreSQL).
        const email = credentials.email.trim().toLowerCase();

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user) return null;

        const isPasswordValid = await bcrypt.compare(credentials.password, user.password);
        if (!isPasswordValid) return null;

        return {
          id:    user.id,
          email: user.email,
          name:  user.name,
          role:  user.role,
          pwv:   passwordFingerprint(user.password),
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({
      token,
      user,
      account,
    }: {
      token: JWT;
      user?: {
        id?: string;
        role?: string;
        email?: string | null;
        name?: string | null;
        pwv?: string;
      } | null;
      account?: { provider?: string } | null;
    }) {
      if (user?.email && account?.provider === 'google') {
        // PRD-239: normalizar email del proveedor OAuth antes del upsert.
        const email = user.email.trim().toLowerCase();
        const dbUser = await prisma.user.upsert({
          where:  { email },
          update: { name: user.name ?? undefined },
          create: {
            email,
            name:     user.name ?? null,
            password: await bcrypt.hash(randomBytes(32).toString('hex'), 12),
            // PRD-048 / PRD-174: rol en mayúsculas, consistente con isAdminRole.
            role:     'CLIENT',
          },
          select: { id: true, role: true, email: true, password: true, isSuperAdmin: true, permissionsUpdatedAt: true },
        });
        token.id                 = dbUser.id;
        token.role               = dbUser.role;
        token.email              = dbUser.email;
        token.pwv                = passwordFingerprint(dbUser.password);
        token.pwvAt              = Date.now();
        token.isSuperAdmin       = dbUser.isSuperAdmin;
        token.permissionsUpdatedAt = dbUser.permissionsUpdatedAt?.toISOString() ?? null;
        return token;
      }

      if (user) {
        token.id    = user.id;
        token.role  = user.role;
        token.pwv   = user.pwv;
        token.pwvAt = Date.now();
        // isSuperAdmin se sincronizará en la primera re-validación periódica
        return token;
      }

      /*
       * PRD-173 / PRD-240 / PRD-091: re-validación periódica del JWT contra
       * la BD. Si la contraseña cambió (reset propio o por admin) la huella
       * deja de coincidir y la sesión se invalida; de paso se sincronizan rol
       * y email (un cambio de email en /account se refleja sin re-login).
       */
      const userId = typeof token.id === 'string' ? token.id : null;
      const lastCheck = typeof token.pwvAt === 'number' ? token.pwvAt : 0;

      if (userId && Date.now() - lastCheck > JWT_REVALIDATE_MS) {
        try {
          const dbUser = await prisma.user.findUnique({
            where:  { id: userId },
            select: { password: true, role: true, email: true, isSuperAdmin: true, permissionsUpdatedAt: true },
          });

          const currentPwv = dbUser ? passwordFingerprint(dbUser.password) : null;

          if (!dbUser || (typeof token.pwv === 'string' && token.pwv !== currentPwv)) {
            // Usuario eliminado o contraseña cambiada → sesión inválida.
            delete (token as Record<string, unknown>).id;
            delete (token as Record<string, unknown>).role;
            delete (token as Record<string, unknown>).pwv;
            return token;
          }

          token.role               = dbUser.role;
          token.email              = dbUser.email;
          token.isSuperAdmin       = dbUser.isSuperAdmin;
          token.permissionsUpdatedAt = dbUser.permissionsUpdatedAt?.toISOString() ?? null;
          // Tokens emitidos antes de este despliegue no traen pwv: se adopta
          // la huella actual (sin cerrar sesiones masivamente en el deploy).
          token.pwv   = currentPwv ?? undefined;
          token.pwvAt = Date.now();
        } catch (err) {
          // BD caída: no cerrar sesiones por un fallo transitorio.
          logError('auth_jwt_revalidation_failed', err, { provider: 'nextauth' });
        }
      }

      return token;
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (session.user) {
        session.user.id          = (token.id   as string) ?? '';
        session.user.role        = (token.role as string) ?? 'client';
        session.user.isSuperAdmin = (token.isSuperAdmin as boolean) ?? false;
        if (typeof token.email === 'string' && token.email) {
          session.user.email = token.email;
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: '/login',
  },
};

const nextAuthHandler = NextAuth(authOptions);

/** SHA-256 corto para no usar el email en claro como clave de rate limit. */
function emailBucket(email: string): string {
  return hashForBucket(email);
}

/**
 * Wrapper con rate limiting CRÍTICO sobre el handler de NextAuth.
 * - 10 POST por IP por minuto (fuerza bruta general sobre Credentials).
 * - PRD-242: bucket secundario por email en /callback/credentials — un
 *   atacante que rota IPs contra un mismo correo también queda frenado.
 */
async function handler(req: Request, ctx: unknown) {
  if (req.method === 'POST') {
    const ip = getClientIp(req);
    const ipResult = await rateLimitCritical(`auth:${hashForBucket(ip)}`, { limit: 10, windowMs: 60_000 });
    if (ipResult.limited) {
      return buildRateLimitedResponse(ipResult.retryAfterSeconds,
        'Demasiados intentos de inicio de sesión. Intenta de nuevo en un minuto.');
    }

    if (new URL(req.url).pathname.endsWith('/callback/credentials')) {
      try {
        const form = await req.clone().formData();
        const email = String(form.get('email') ?? '').trim().toLowerCase();
        if (email) {
          const emailResult = await rateLimitCritical(`auth:email:${emailBucket(email)}`, {
            limit: 10,
            windowMs: 15 * 60_000,
          });
          if (emailResult.limited) {
            return buildRateLimitedResponse(emailResult.retryAfterSeconds,
              'Demasiados intentos para este correo. Espera unos minutos.');
          }
        }
      } catch {
        /* body ilegible: sigue el flujo normal de NextAuth */
      }
    }
  }
  return nextAuthHandler(req, ctx as Parameters<typeof nextAuthHandler>[1]);
}

export { handler as GET, handler as POST };
