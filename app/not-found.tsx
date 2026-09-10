/**
 * not-found.tsx — Boundary 404 global (Next.js App Router)
 * Server Component: puede leer Prisma directamente.
 * Muestra búsqueda rápida y categorías destacadas para retener al usuario.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Search, Home, Tag, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Página no encontrada",
  robots: { index: false, follow: false },
};

async function getFeaturedCategories() {
  try {
    return await prisma.category.findMany({
      where: { isFeatured: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { name: true, slug: true, imageUrl: true },
      take: 6,
    });
  } catch {
    return [];
  }
}

export default async function NotFound() {
  const categories = await getFeaturedCategories();

  return (
    <div className="min-h-[75vh] flex flex-col items-center justify-center px-4 py-16">

      {/* Número 404 decorativo */}
      <div className="relative mb-8 select-none">
        <span
          className="text-[120px] sm:text-[160px] font-black tracking-tightest leading-none text-navy-100 block"
          aria-hidden="true"
        >
          404
        </span>
      </div>

      {/* Texto principal */}
      <div className="max-w-md text-center mb-8">
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-navy mb-3">
          Te perdiste, pana
        </h1>
        <p className="text-navy-400 text-base leading-relaxed">
          Nos pasa hasta a nosotros buscando un local en el centro de
          Barquisimeto. Esta página ya no existe — pero lo que viniste a buscar
          seguro está en el catálogo.
        </p>
      </div>

      {/* Buscador rápido — H22: apunta a la búsqueda real /buscar (la misma
          que SearchBar y el SearchAction del schema), no al catálogo */}
      <form
        action="/buscar"
        method="GET"
        className="w-full max-w-md mb-10"
      >
        <div className="relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-navy-400 pointer-events-none"
            strokeWidth={1.8}
          />
          <input
            type="search"
            name="q"
            placeholder="Buscar productos…"
            aria-label="Buscar en el catálogo"
            autoComplete="off"
            className="w-full bg-white border border-border rounded-xl pl-12 pr-28 py-3.5 text-navy placeholder-navy-300 text-sm shadow-soft focus:outline-none focus:ring-2 focus:ring-brand-yellow/40 focus:border-brand-yellow transition-all"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-navy text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-navy-700 active:scale-95 transition-all"
          >
            Buscar
          </button>
        </div>
      </form>

      {/* CTAs rápidos */}
      <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-navy text-white font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-navy-700 active:scale-95 transition-all shadow-card"
        >
          <Home className="w-4 h-4" />
          Inicio
        </Link>
        <Link
          href="/productos"
          className="inline-flex items-center gap-2 bg-white border border-border text-navy font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-surface-muted active:scale-95 transition-all shadow-soft"
        >
          <Tag className="w-4 h-4" />
          Ver todos los productos
        </Link>
      </div>

      {/* Categorías destacadas */}
      {categories.length > 0 && (
        <section className="w-full max-w-2xl">
          <h2 className="text-center text-xs font-semibold uppercase tracking-widest text-navy-300 mb-4">
            Categorías populares
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/categoria/${cat.slug}`}
                className="group inline-flex items-center gap-1.5 bg-white border border-border text-navy text-sm font-medium px-4 py-2 rounded-full hover:border-brand-yellow hover:bg-brand-yellow/5 active:scale-95 transition-all shadow-soft"
              >
                {cat.name}
                <ArrowRight className="w-3.5 h-3.5 text-navy-300 group-hover:text-brand-yellow group-hover:translate-x-0.5 transition-all" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Branding */}
      <p className="mt-14 text-xs text-slate-600">
        <span className="font-black tracking-tight">
          Mundo<span className="text-amber-700">Tech</span>
        </span>{" "}
        — Conectados Contigo · Carrera 21 con esquina calle 21, Centro, Barquisimeto 3001
      </p>
    </div>
  );
}
