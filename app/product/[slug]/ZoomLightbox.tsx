'use client';

import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';

interface Props {
  url: string;
  alt: string;
  zoomed: boolean;
  onZoomChange: (zoomed: boolean) => void;
}

/**
 * Componente de zoom con react-zoom-pan-pinch, cargado dinámicamente
 * solo cuando el usuario abre el lightbox. Reduce ~10-15 KB del bundle
 * inicial de la página de producto.
 */
export default function ZoomLightbox({ url, alt, zoomed, onZoomChange }: Props) {

  return (
    <TransformWrapper
      minScale={1}
      maxScale={4}
      centerOnInit
      doubleClick={{ mode: 'toggle', step: 2.5 }}
      wheel={{ disabled: true }}
      panning={{ disabled: !zoomed }}
      onTransform={(_ref: unknown, state: { scale: number }) => onZoomChange(state.scale > 1.01)}
    >
      <TransformComponent
        wrapperStyle={{ width: '100%', height: '100%' }}
        contentStyle={{ width: '100%', height: '100%' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-contain"
          draggable={false}
          onError={(e) => {
            const target = e.currentTarget;
            if (target.src !== '/placeholder-product.png') {
              target.src = '/placeholder-product.png';
            }
          }}
        />
      </TransformComponent>
    </TransformWrapper>
  );
}
