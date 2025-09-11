import dynamic from "next/dynamic";
import type { ProductDetail } from "@/lib/types";
import { getMockProduct, getRelatedProducts } from "@/lib/mock/product";
import CustomerReviews from "@/components/product/CustomerReviews";
import RelatedProducts from "@/components/product/RelatedProducts";

const ProductDetailClient = dynamic(() => import("@/components/product/ProductDetailClient"));

export default async function ProductPage(props: { params: { slug: string } }) {
  const { slug } = props.params;
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
