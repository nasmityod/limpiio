import { z } from 'zod';

export const authLoginSchema = z.object({
  email:    z.string().min(1, 'El correo es obligatorio.').email('Correo inválido.'),
  password: z.string().min(1, 'La contraseña es obligatoria.').min(8, 'Mínimo 8 caracteres.'),
});

export const authRegisterSchema = z
  .object({
    name:            z.string().min(1, 'El nombre es obligatorio.').min(2, 'Mínimo 2 caracteres.'),
    email:           z.string().min(1, 'El correo es obligatorio.').email('Correo inválido.'),
    password:        z.string().min(1, 'La contraseña es obligatoria.').min(8, 'Mínimo 8 caracteres.'),
    confirmPassword: z.string().min(1, 'Confirma tu contraseña.'),
    acceptTerms:     z.boolean().refine((v) => v === true, {
      message: 'Debes aceptar los términos y condiciones.',
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path:    ['confirmPassword'],
  });

export type AuthLoginValues = z.infer<typeof authLoginSchema>;
export type AuthRegisterValues = z.infer<typeof authRegisterSchema>;
