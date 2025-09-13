import dynamic from "next/dynamic";
import type { ProductDetail } from "@/lib/types";
import { getMockProduct, getRelatedProducts } from "@/lib/mock/product";
import CustomerReviews from "@/components/product/CustomerReviews";
import RelatedProducts from "@/components/product/RelatedProducts";

// Lazy load product detail client for better performance
const ProductDetailClient = dynamic(
  () => import("@/components/product/ProductDetailClient"),
  {
    loading: () => (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="h-96 animate-pulse bg-white/5 rounded-xl" />
      </div>
    ),
  }
);

export default async function ProductPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const { slug } = params;
  const product: ProductDetail = getMockProduct(slug);
  const related = getRelatedProducts();

  return (
    <main>
      <ProductDetailClient product={product} />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <CustomerReviews avgRating={product.avgRating} reviewCount={product.reviewCount} reviews={product.reviews} />
        <RelatedProducts products={related} />
      </div>
    </main>
  );
}
