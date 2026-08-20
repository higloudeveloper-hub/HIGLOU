"use client";

import { AppShell } from "@/components/layout/app-shell";
import { StudioFrame } from "@/components/layout/studio-frame";
import { PromoCarouselStudio } from "@/components/facebook/promo-carousel-studio";

export default function FacebookPromoPage() {
  return (
    <AppShell hideHeader flush>
      <StudioFrame
        kicker="Pestaña Don Baratón"
        title="Promo Facebook"
        hint="Carrusel Alibaba o vitrina con productos reales"
        scroll={false}
      >
        <PromoCarouselStudio />
      </StudioFrame>
    </AppShell>
  );
}
