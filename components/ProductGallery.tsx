'use client';

import { useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { useReducedMotion, reducedTransition } from '@/lib/motion';

interface ProductGalleryProps {
  images: string[];
}

const ProductGallery = ({ images }: ProductGalleryProps) => {
  const prefersReduced = useReducedMotion();
  const [mainImage, setMainImage] = useState(images[0]);

  return (
    <div className="flex flex-col gap-4">
      <AnimatePresence mode='wait'>
        <motion.div
          key={mainImage}
          className="relative w-full h-96 bg-white rounded-[10px] shadow-sm overflow-hidden"
          initial={prefersReduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
          animate={prefersReduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={prefersReduced ? { opacity: 0 } : { opacity: 0, y: -20 }}
          transition={prefersReduced ? reducedTransition : { duration: 0.3 }}
        >
          <Image
            src={mainImage}
            alt="Product Image"
            fill
            className="p-4 object-contain"
          />
        </motion.div>
      </AnimatePresence>
      <div className="grid grid-cols-5 gap-2">
        {images.map((image, index) => (
          <button
            type="button"
            key={index}
            className={`relative h-20 w-full rounded-md overflow-hidden cursor-pointer transition-all duration-200 ${
              mainImage === image ? 'ring-2 ring-[color:var(--accent)]' : 'hover:ring-2 ring-gray-300'
            }`}
            onClick={() => setMainImage(image)}
          >
            <Image
              src={image}
              alt={`Product thumbnail ${index + 1}`}
              fill
              className="object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
};

export default ProductGallery;