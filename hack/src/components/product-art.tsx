import type { Product } from "@/data"
import { cn } from "@/lib/utils"

export function ProductArt({
  product,
  src,
  className,
  imgClassName,
}: {
  product: Product
  src?: string
  className?: string
  imgClassName?: string
}) {
  return (
    <div className={cn("relative overflow-hidden bg-white", className)}>
      <img
        src={src ?? product.image}
        alt={`${product.brand} ${product.name}`}
        loading="lazy"
        className={cn(
          "size-full",
          product.fit === "contain" && !src ? "object-contain p-3" : "object-cover",
          imgClassName,
        )}
      />
    </div>
  )
}
