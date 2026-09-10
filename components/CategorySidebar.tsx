'use client';

import { useState } from 'react';
import { ChevronDown, Tag, SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { useProducts } from '../context/ProductContext';

const sortOptions = [
  { value: 'default',    label: 'Relevancia'           },
  { value: 'price-asc',  label: 'Menor precio primero' },
  { value: 'price-desc', label: 'Mayor precio primero' },
  { value: 'name-asc',   label: 'Nombre: A-Z'          },
  { value: 'name-desc',  label: 'Nombre: Z-A'          },
];

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ icon, title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full px-5 h-12 text-left text-navy"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5 text-[13px] font-semibold tracking-tight">
          <span className="text-slate-400">{icon}</span>
          {title}
        </span>
        <ChevronDown
          size={15}
          className={`text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

const CategorySidebar = () => {
  const { products, filterCategory, setFilterCategory, sortOption, setSortOption } = useProducts();
  const categories = Array.from(new Set(products.map((p) => p.category))).sort();

  const catCount = (cat: string) =>
    cat === 'all' ? products.length : products.filter((p) => p.category === cat).length;

  return (
    <aside className="bg-white rounded-2xl border border-slate-200/80 shadow-soft overflow-hidden">
      <CollapsibleSection icon={<Tag size={14} />} title="Categorías" defaultOpen>
        <ul className="space-y-0.5">
          <li>
            <button type="button"
              onClick={() => setFilterCategory('all')}
              className={`flex items-center justify-between w-full px-3 h-10 rounded-xl text-[13px] transition-colors ${
                filterCategory === 'all'
                  ? 'bg-navy text-white font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-navy'
              }`}
            >
              <span>Todos los productos</span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  filterCategory === 'all' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {catCount('all')}
              </span>
            </button>
          </li>
          {categories.map((cat) => (
            <li key={cat}>
              <button type="button"
                onClick={() => setFilterCategory(cat)}
                className={`flex items-center justify-between w-full px-3 h-10 rounded-xl text-[13px] transition-colors ${
                  filterCategory === cat
                    ? 'bg-navy text-white font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-navy'
                }`}
              >
                <span className="truncate capitalize">{cat}</span>
                <span
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
                    filterCategory === cat ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {catCount(cat)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </CollapsibleSection>

      <CollapsibleSection icon={<ArrowUpDown size={14} />} title="Ordenar" defaultOpen={false}>
        <ul className="space-y-0.5">
          {sortOptions.map((opt) => (
            <li key={opt.value}>
              <button type="button"
                onClick={() => setSortOption(opt.value)}
                className={`flex items-center justify-between w-full px-3 h-10 rounded-xl text-[13px] transition-colors ${
                  sortOption === opt.value
                    ? 'bg-slate-100 text-navy font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-navy'
                }`}
              >
                <span>{opt.label}</span>
                {sortOption === opt.value && (
                  <span className="w-2 h-2 rounded-full bg-brand-yellow" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </CollapsibleSection>

      <div className="px-5 py-4 bg-slate-50">
        <div className="flex items-center gap-2 text-[12px] text-slate-500">
          <SlidersHorizontal size={13} className="text-slate-400" />
          {products.length} productos en total
        </div>
      </div>
    </aside>
  );
};

export default CategorySidebar;
