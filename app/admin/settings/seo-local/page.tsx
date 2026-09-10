import { readSeoLocal } from '@/lib/seo-local';
import SeoLocalEditor from './SeoLocalEditor';

export const dynamic = 'force-dynamic';

export default async function AdminSeoLocalPage() {
  const seo = await readSeoLocal();
  return <SeoLocalEditor initial={seo} />;
}
