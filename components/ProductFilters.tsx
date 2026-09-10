'use client';

import { useProducts } from '../context/ProductContext';

const ProductFilters = () => {
  const { products, sortOption, setSortOption, filterCategory, setFilterCategory } = useProducts();

  const categories = ['all', ...Array.from(new Set(products.map(p => p.category)))];

  return (
    <div className="flex flex-col md:flex-row gap-4 mb-8">
      <div className="flex-1">
        <label htmlFor="category-filter" className="block text-sm font-medium text-gray-700 mb-1">Filtrar por Categoría</label>
        <select
          id="category-filter"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-navy/30 focus:border-navy"
        >
          {categories.map(category => (
            <option key={category} value={category} className="capitalize">
              {category === 'all' ? 'Todas las categorías' : category}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1">
        <label htmlFor="sort-order" className="block text-sm font-medium text-gray-700 mb-1">Ordenar por</label>
        <select
          id="sort-order"
          value={sortOption}
          onChange={(e) => setSortOption(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-navy/30 focus:border-navy"
        >
          <option value="default">Por defecto</option>
          <option value="price-asc">Precio: de menor a mayor</option>
          <option value="price-desc">Precio: de mayor a menor</option>
          <option value="name-asc">Nombre: A-Z</option>
          <option value="name-desc">Nombre: Z-A</option>
        </select>
      </div>
    </div>
  );
};

export default ProductFilters;