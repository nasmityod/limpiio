'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Lock, Loader2 } from 'lucide-react';

import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/use-toast';
import { updatePassword } from '@/app/account/actions';

const formSchema = z
  .object({
    currentPassword: z.string().min(1, { message: 'Requerida.' }),
    newPassword:     z.string().min(8, { message: 'Mínimo 8 caracteres.' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmPassword'],
  });

export default function ChangePasswordForm() {
  const { toast } = useToast();
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const result = await updatePassword(values);
    if (result.success) {
      toast({ title: '¡Listo!', description: result.message });
      form.reset();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 max-w-xl">
      <Field
        id="currentPassword"
        label="Contraseña actual"
        leading={<Lock size={15} />}
        error={form.formState.errors.currentPassword?.message}
      >
        <Input
          id="currentPassword"
          type="password"
          {...form.register('currentPassword')}
          invalid={!!form.formState.errors.currentPassword}
          className="pl-11"
        />
      </Field>

      <Field
        id="newPassword"
        label="Nueva contraseña"
        leading={<Lock size={15} />}
        error={form.formState.errors.newPassword?.message}
        hint="Mínimo 8 caracteres"
      >
        <Input
          id="newPassword"
          type="password"
          {...form.register('newPassword')}
          invalid={!!form.formState.errors.newPassword}
          className="pl-11"
        />
      </Field>

      <Field
        id="confirmPassword"
        label="Confirmar nueva contraseña"
        leading={<Lock size={15} />}
        error={form.formState.errors.confirmPassword?.message}
      >
        <Input
          id="confirmPassword"
          type="password"
          {...form.register('confirmPassword')}
          invalid={!!form.formState.errors.confirmPassword}
          className="pl-11"
        />
      </Field>

      <button
        type="submit"
        disabled={form.formState.isSubmitting}
        className="inline-flex items-center justify-center gap-2 bg-navy text-white font-semibold text-sm h-12 px-7 rounded-2xl hover:bg-navy-700 shadow-soft hover:shadow-card hover:-translate-y-0.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {form.formState.isSubmitting ? (
          <>
            <Loader2 size={16} className="animate-spin" /> Guardando…
          </>
        ) : (
          'Cambiar contraseña'
        )}
      </button>
    </form>
  );
}
