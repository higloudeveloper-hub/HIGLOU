import type { Metadata } from "next";
import { CompareStudio } from "@/components/compare/compare-studio";

export const metadata: Metadata = {
  title: "Compare · Higlou",
  description:
    "Pegá un link de Amazon y encontrá la misma opción más barata en eBay, Walmart y Home Depot.",
  openGraph: {
    title: "Higlou Compare",
    description:
      "¿Amazon es lo más barato? Compará el mismo producto en otras tiendas.",
  },
};

export default function ComparePage() {
  return <CompareStudio />;
}
