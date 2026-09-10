import { redirect } from 'next/navigation';

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AccountPage({ searchParams }: Props) {
  const params = await searchParams;
  const error = params['error'];
  redirect(error ? `/account/orders?error=${error}` : '/account/orders');
}