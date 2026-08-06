"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdvancedDrawer } from "@/components/listing/advanced-drawer";
import type { StoreBranding } from "@/config/store-branding";
import type { ConfidenceStatus } from "@/lib/ai/confidence-engine";
import type { ProductListing } from "@/types/product";

type FieldConfidence = Record<
  string,
  { status: ConfidenceStatus; sources: string[]; confidence: number }
>;

export function MoreDetailsDialog({
  open,
  onOpenChange,
  listing,
  fieldConfidence,
  analyzing,
  loadingProduct,
  httpsImageUrls,
  onUpdate,
  onRegenerateDescription,
  setFieldConfidence,
  storeBranding,
  onStoreBrandingChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: ProductListing;
  fieldConfidence: FieldConfidence;
  analyzing: boolean;
  loadingProduct: boolean;
  httpsImageUrls: string[];
  onUpdate: <K extends keyof ProductListing>(
    key: K,
    value: ProductListing[K],
  ) => void;
  onRegenerateDescription: () => void;
  setFieldConfidence: React.Dispatch<React.SetStateAction<FieldConfidence>>;
  storeBranding?: StoreBranding;
  onStoreBrandingChange?: (next: StoreBranding) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="fixed top-[2.5vh] left-1/2 flex h-[min(95vh,960px)] w-[min(96vw,72rem)] max-w-6xl -translate-x-1/2 translate-y-0 flex-col gap-3 overflow-hidden p-5 sm:max-w-6xl"
      >
        <DialogHeader className="shrink-0 pr-8 text-left">
          <DialogTitle className="text-lg">Edit listing details</DialogTitle>
          <DialogDescription>
            Store / HTML template, item specifics, description, and shipping —
            scroll inside this panel.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <AdvancedDrawer
            listing={listing}
            fieldConfidence={fieldConfidence}
            analyzing={analyzing}
            loadingProduct={loadingProduct}
            httpsImageUrls={httpsImageUrls}
            onUpdate={onUpdate}
            onRegenerateDescription={onRegenerateDescription}
            setFieldConfidence={setFieldConfidence}
            forceOpen
            storeBranding={storeBranding}
            onStoreBrandingChange={onStoreBrandingChange}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
