"use client";

import { AppShell } from "@/components/layout/app-shell";
import { StudioFrame } from "@/components/layout/studio-frame";
import { PromoCarouselStudio } from "@/components/facebook/promo-carousel-studio";

export default function FacebookPromoPage() {
  return (
    <AppShell hideHeader flush>
      <StudioFrame
        kicker="Don Baratón"
        title="Elegí productos"
        hint="Carrusel Facebook"
        scroll={false}
      >
        <PromoCarouselStudio />
      </StudioFrame>
    </AppShell>
  );
}
