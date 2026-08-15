import { HiglouLogo } from "@/components/brand/higlou-logo";
import { cn } from "@/lib/utils";

/** Brand mark + Higlou wordmark (wizard / listing chrome). */
export function HiglouMark({
  className,
  href = "/home",
}: {
  className?: string;
  href?: string;
}) {
  return <HiglouLogo href={href} size={30} className={cn(className)} />;
}
