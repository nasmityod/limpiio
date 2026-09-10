'use client';

import { useProducts } from '../context/ProductContext';
import { Watch, Laptop, Gamepad2, Tv, Microwave, Grid3X3 } from 'lucide-react';

const categoryIcons: Record<string, React.ReactNode> = {
  all:              <Grid3X3   size={20} />,
  Relojes:          <Watch     size={20} />,
  Laptops:          <Laptop    size={20} />,
  Consolas:         <Gamepad2  size={20} />,
  Televisores:      <Tv        size={20} />,
  Electrodomésticos:<Microwave size={20} />,
};

const categoryLabels: Record<string, string> = {
  all: 'Todos',
};

const CategoryNav = () => {
  const { products, filterCategory, setFilterCategory } = useProducts();
  const categories = ['all', ...Array.from(new Set(products.map(p => p.category)))];

  return (
    <div className="my-10">
      <div className="flex gap-2 flex-wrap justify-center">
        {categories.map(cat => {
          const isActive = filterCategory === cat;
          const label = categoryLabels[cat] ?? cat;
          return (
            <button type="button"
              key={cat}
              onClick={() => setFilterCategory(cat)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 border ${
                isActive
                  ? 'bg-navy text-white border-navy shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-navy hover:text-navy'
              }`}
            >
              <span className={isActive ? 'text-brand-yellow' : 'text-gray-400'}>
                {categoryIcons[cat] ?? <Grid3X3 size={20} />}
              </span>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default CategoryNav;
