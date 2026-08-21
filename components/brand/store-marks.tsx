import { cn } from "@/lib/utils";

type MarkProps = {
  className?: string;
  title?: string;
};

function BrandImg({
  src,
  title,
  className,
}: {
  src: string;
  title: string;
  className?: string;
}) {
  return (
    // Official vector marks from /public/brands — never scale bitmap text.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={title}
      className={cn("h-[1em] w-auto max-w-full select-none object-contain object-center", className)}
      draggable={false}
    />
  );
}

/** Official 4-color eBay wordmark. */
export function EbayMark({ className, title = "eBay" }: MarkProps) {
  return <BrandImg src="/brands/ebay.svg" title={title} className={className} />;
}

/** Official Amazon wordmark + smile. */
export function AmazonMark({
  className,
  invert = false,
  title = "Amazon",
}: MarkProps & { invert?: boolean }) {
  return (
    <BrandImg
      src={invert ? "/brands/amazon-white.svg" : "/brands/amazon.svg"}
      title={title}
      className={className}
    />
  );
}

/** Home Depot house mark. */
export function HomeDepotMark({
  className,
  invert = false,
  title = "The Home Depot",
}: MarkProps & { invert?: boolean }) {
  return (
    <BrandImg
      src={invert ? "/brands/homedepot-white.svg" : "/brands/homedepot.svg"}
      title={title}
      className={className}
    />
  );
}

/** Official Walmart spark. */
export function WalmartMark({ className, title = "Walmart" }: MarkProps) {
  return <BrandImg src="/brands/walmart.svg" title={title} className={className} />;
}

/** Official Facebook wordmark. */
export function FacebookMark({ className, title = "Facebook" }: MarkProps) {
  return <BrandImg src="/brands/facebook.svg" title={title} className={className} />;
}

/** Official Facebook f mark for tight chrome. */
export function FacebookFMark({ className, title = "Facebook" }: MarkProps) {
  return <BrandImg src="/brands/facebook-f.svg" title={title} className={className} />;
}

/** Official Shopify bag + wordmark. */
export function ShopifyMark({ className, title = "Shopify" }: MarkProps) {
  return <BrandImg src="/brands/shopify.svg" title={title} className={className} />;
}

/** Your site — browser window, not generic type. */
export function SiteMark({ className, title = "Your site" }: MarkProps) {
  return <BrandImg src="/brands/site.svg" title={title} className={className} />;
}
