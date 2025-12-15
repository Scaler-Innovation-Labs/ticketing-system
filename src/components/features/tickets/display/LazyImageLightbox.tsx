/**
 * Lazy Image Lightbox Wrapper
 * 
 * Lazy-loads ImageLightbox only when needed.
 * This reduces initial bundle size and improves performance.
 */

import { Suspense, lazy } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const ImageLightbox = lazy(() => 
  import("./ImageLightbox").then(module => ({ default: module.ImageLightbox }))
);

interface LazyImageLightboxProps {
  images: string[];
  initialIndex?: number;
}

function ImageLightboxSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="aspect-square rounded-lg" />
      ))}
    </div>
  );
}

export function LazyImageLightbox({ images, initialIndex }: LazyImageLightboxProps) {
  return (
    <Suspense fallback={<ImageLightboxSkeleton />}>
      <ImageLightbox images={images} initialIndex={initialIndex} />
    </Suspense>
  );
}

