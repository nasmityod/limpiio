'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { User as NextAuthUser } from 'next-auth';
import { useRouter } from 'next/navigation';
import { Mail, User, Loader2 } from 'lucide-react';

import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { updateUserDetails } from '@/app/account/actions';
import { useToast } from '@/components/ui/use-toast';

const formSchema = z.object({
  name:  z.string().min(2, { message: 'Mínimo 2 caracteres.' }),
  email: z.string().email({ message: 'Correo inválido.' }),
});

interface UserDetailsFormProps {
  user: NextAuthUser;
}

export default function UserDetailsForm({ user }: UserDetailsFormProps) {
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name:  user.name  || '',
      email: user.email || '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const result = await updateUserDetails(values);
    if (result.success) {
      toast({ title: '¡Listo!', description: result.message });
      router.refresh();
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 max-w-xl">
      <Field id="name" label="Nombre" leading={<User size={15} />} error={form.formState.errors.name?.message}>
        <Input
          id="name"
          {...form.register('name')}
          invalid={!!form.formState.errors.name}
          className="pl-11"
        />
      </Field>

      <Field id="email" label="Correo electrónico" leading={<Mail size={15} />} error={form.formState.errors.email?.message}>
        <Input
          id="email"
          type="email"
          {...form.register('email')}
          invalid={!!form.formState.errors.email}
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
          'Guardar cambios'
        )}
      </button>
    </form>
  );
}
