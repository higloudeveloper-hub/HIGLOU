"use client";

import {
  CloudUpload,
  GripVertical,
  Image as ImageIcon,
  ImagePlus,
  Package,
  RefreshCw,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DEFAULT_VALUES } from "@/config/default-values";
import {
  isAcceptedUploadMime,
  SUPPORTED_IMAGE_ACCEPT_ATTR,
} from "@/config/supported-image-formats";
import type { ProductImage } from "@/types/product";
import { nanoid } from "nanoid";
import { cn } from "@/lib/utils";

interface ImageUploaderProps {
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
  disabled?: boolean;
  productId?: string;
  compact?: boolean;
  /** `wizard` = dashed box. `stage` = full-area drop over the live storefronts. */
  variant?: "default" | "wizard" | "stage" | "tray";
}

type UploadApiImage = {
  publicUrl: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

async function uploadImageFile(
  file: File,
  productId?: string,
): Promise<UploadApiImage> {
  const form = new FormData();
  form.append("files", file, file.name);
  if (productId) form.append("productId", productId);

  const response = await fetch("/api/upload-images", {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error || "Image upload failed");
  }

  const data = (await response.json()) as { images: UploadApiImage[] };
  const uploaded = data.images?.[0];
  if (!uploaded?.publicUrl || !/^https:\/\//i.test(uploaded.publicUrl)) {
    throw new Error("Upload did not return an HTTPS public URL");
  }
  return uploaded;
}

export function ImageUploader({
  images,
  onChange,
  disabled,
  productId,
  compact = false,
  variant = "default",
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const retryUpload = useCallback(
    async (imageId: string) => {
      const target = images.find((img) => img.id === imageId);
      if (!target?.previewUrl) {
        toast.error("No local preview available to retry upload");
        return;
      }

      try {
        const blob = await fetch(target.previewUrl).then((r) => r.blob());
        const file = new File([blob], target.fileName, {
          type: target.mimeType || "image/jpeg",
        });
        onChange(
          images.map((img) =>
            img.id === imageId ? { ...img, uploadProgress: 40 } : img,
          ),
        );
        const uploaded = await uploadImageFile(file, productId);
        onChange(
          images.map((img) =>
            img.id === imageId
              ? {
                  ...img,
                  url: uploaded.publicUrl,
                  storagePath: uploaded.storagePath,
                  uploadProgress: 100,
                }
              : img,
          ),
        );
        toast.success("Image uploaded");
      } catch (error) {
        onChange(
          images.map((img) =>
            img.id === imageId ? { ...img, uploadProgress: 100 } : img,
          ),
        );
        toast.error(error instanceof Error ? error.message : "Retry failed");
      }
    },
    [images, onChange, productId],
  );

  const processFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (!files.length) return;
      if (images.length + files.length > DEFAULT_VALUES.maxImages) {
        toast.error(`Maximum ${DEFAULT_VALUES.maxImages} images allowed.`);
        return;
      }

      setBusy(true);
      const next: ProductImage[] = [...images];

      for (const file of files) {
        if (!isAcceptedUploadMime(file.type)) {
          toast.error(`${file.name}: unsupported file type`);
          continue;
        }
        if (file.size > DEFAULT_VALUES.maxImageSizeMb * 1024 * 1024) {
          toast.error(
            `${file.name}: exceeds ${DEFAULT_VALUES.maxImageSizeMb}MB`,
          );
          continue;
        }

        try {
          // Upload original file to Supabase — these URLs go onto eBay listings.
          // Do not downscale or recompress (would destroy listing photo quality).
          const previewUrl = URL.createObjectURL(file);
          const id = nanoid();
          const image: ProductImage = {
            id,
            url: "",
            fileName: file.name.replace(/\s+/g, "_"),
            sortOrder: next.length,
            isPrimary: next.length === 0,
            mimeType: file.type || "image/jpeg",
            sizeBytes: file.size,
            previewUrl,
            uploadProgress: 35,
          };
          next.push(image);
          onChange([...next]);

          try {
            image.uploadProgress = 70;
            onChange([...next]);
            const uploaded = await uploadImageFile(file, productId);
            image.url = uploaded.publicUrl;
            image.storagePath = uploaded.storagePath;
            image.sizeBytes = uploaded.sizeBytes;
            image.mimeType = uploaded.mimeType || image.mimeType;
            image.uploadProgress = 100;
            onChange([...next]);
          } catch (uploadError) {
            image.uploadProgress = 100;
            onChange([...next]);
            toast.error(
              uploadError instanceof Error
                ? `${file.name}: ${uploadError.message}`
                : `${file.name}: upload failed`,
            );
          }
        } catch {
          toast.error(`Failed to process ${file.name}`);
        }
      }

      setBusy(false);
    },
    [images, onChange, productId],
  );

  const onDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    if (disabled) return;
    await processFiles(event.dataTransfer.files);
  };

  const setPrimary = (id: string) => {
    onChange(
      images.map((img) => ({
        ...img,
        isPrimary: img.id === id,
      })),
    );
  };

  const removeImage = (id: string) => {
    const remaining = images
      .filter((img) => img.id !== id)
      .map((img, index) => ({ ...img, sortOrder: index }));
    if (remaining.length && !remaining.some((img) => img.isPrimary)) {
      remaining[0].isPrimary = true;
    }
    onChange(remaining);
  };

  const clearAll = () => {
    onChange([]);
  };

  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    const copy = [...images];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    onChange(
      copy.map((img, index) => ({
        ...img,
        sortOrder: index,
        isPrimary: index === 0,
      })),
    );
  };

  const rotateOrder = () => {
    if (images.length < 2) return;
    const copy = [...images];
    const first = copy.shift();
    if (!first) return;
    copy.push(first);
    onChange(
      copy.map((img, index) => ({
        ...img,
        sortOrder: index,
        isPrimary: index === 0,
      })),
    );
    toast.message("Photos reordered");
  };

  const openFilePicker = () => {
    if (disabled || busy) return;
    inputRef.current?.click();
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={SUPPORTED_IMAGE_ACCEPT_ATTR}
      multiple
      className="hidden"
      onChange={(e) => {
        if (e.target.files) void processFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  if (variant === "tray") {
    return (
      <div className="flex flex-col gap-2">
        {fileInput}
        <p className="text-[11px] font-medium text-[#707070]">
          Drag to reorder · first photo is the eBay main · X to remove · Add your own
        </p>
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
            {images.map((image, index) => (
              <div
                key={image.id}
                draggable={!disabled}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (dragIndex === null) return;
                  moveImage(dragIndex, index);
                  setDragIndex(null);
                }}
                onDragEnd={() => setDragIndex(null)}
                className={cn(
                  "relative size-16 shrink-0 cursor-grab overflow-hidden rounded-md bg-[#f7f7f7] ring-1 ring-[#e5e5e5] active:cursor-grabbing",
                  dragIndex === index && "opacity-50",
                  image.isPrimary && "ring-2 ring-[#141414]",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.previewUrl || image.url}
                  alt=""
                  className="size-full object-contain p-0.5"
                  draggable={false}
                />
                <button
                  type="button"
                  aria-label="Remove photo"
                  className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-sm bg-white text-[#141414] shadow-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeImage(image.id);
                  }}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={openFilePicker}
            disabled={disabled || busy}
            className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-[#d8d8d8] bg-white px-3 text-[12px] font-semibold text-[#141414] disabled:opacity-40"
          >
            <ImagePlus className="size-3.5" />
            Add
          </button>
        </div>
      </div>
    );
  }

  if (variant === "stage") {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
        <div
          role={images.length === 0 ? "button" : undefined}
          tabIndex={images.length === 0 ? 0 : undefined}
          onKeyDown={(e) => {
            if (images.length > 0) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openFilePicker();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragging(false);
          }}
          onDrop={onDrop}
          onClick={() => {
            if (images.length === 0) openFilePicker();
          }}
          className={cn(
            "pointer-events-auto flex min-h-0 flex-1 flex-col",
            images.length === 0 && "cursor-pointer",
            (disabled || busy) && "pointer-events-none opacity-60",
          )}
        >
          <div className="relative min-h-0 flex-1" />
          {fileInput}
        </div>
        {images.length > 0 ? (
          <div className="pointer-events-auto flex shrink-0 flex-col gap-1.5 border-t border-[#e5e5e5] bg-white px-3 py-2">
            <p className="text-[11px] font-medium text-[#707070]">
              Drag to reorder · first photo is the eBay main · X to remove
            </p>
            <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
              {images.map((image, index) => (
                <div
                  key={image.id}
                  draggable={!disabled}
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (dragIndex === null) return;
                    moveImage(dragIndex, index);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                  className={cn(
                    "relative size-14 shrink-0 cursor-grab overflow-hidden rounded-md bg-[#f7f7f7] ring-1 ring-[#e5e5e5] active:cursor-grabbing",
                    dragIndex === index && "opacity-50",
                    image.isPrimary && "ring-2 ring-[#141414]",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.previewUrl || image.url}
                    alt=""
                    className="size-full object-contain p-0.5"
                    draggable={false}
                  />
                  <button
                    type="button"
                    aria-label="Remove photo"
                    className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-sm bg-white text-[#141414] shadow-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImage(image.id);
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={openFilePicker}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-[#d8d8d8] bg-white px-3 text-[12px] font-semibold text-[#141414]"
            >
              <ImagePlus className="size-3.5" />
              Add
            </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (variant === "wizard") {
    return (
      <div>
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openFilePicker();
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragging(false);
          }}
          onDrop={onDrop}
          onClick={openFilePicker}
          className={cn(
            "relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all",
            dragging
              ? "border-brand bg-brand-soft/60"
              : "border-border bg-background/40 hover:border-brand/60 hover:bg-brand-soft/30",
            (disabled || busy) && "pointer-events-none opacity-60",
          )}
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-soft text-brand-foreground">
            <CloudUpload className="h-6 w-6" />
          </span>
          <h2 className="mt-5 text-[22px] font-semibold tracking-tight">
            Drag &amp; drop your photos here
          </h2>
          <p className="mt-1 text-[14px] text-muted-foreground">
            or click to browse
          </p>
          <p className="mt-3 text-[12px] text-muted-foreground">
            JPG, PNG, WEBP up to {DEFAULT_VALUES.maxImageSizeMb}MB each
          </p>
          <button
            type="button"
            disabled={disabled || busy}
            className="mt-5 inline-flex items-center gap-2 rounded-full border-2 border-brand bg-surface px-5 py-2.5 text-[14px] font-semibold text-foreground transition-colors hover:bg-brand-soft disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              openFilePicker();
            }}
          >
            <ImageIcon className="h-4 w-4" /> Browse Files
          </button>
          {fileInput}
        </div>

        {images.length > 0 ? (
          <>
            <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
              <AnimatePresence>
                {images.map((image, index) => (
                  <motion.div
                    key={image.id}
                    layout
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.25 }}
                    draggable={!disabled}
                    onDragStart={() => setDragIndex(index)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (dragIndex === null) return;
                      moveImage(dragIndex, index);
                      setDragIndex(null);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted",
                      dragIndex === index && "opacity-50",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.previewUrl || image.url}
                      alt={image.fileName}
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${image.fileName}`}
                      className="absolute top-1.5 right-1.5 grid h-6 w-6 place-items-center rounded-full bg-surface/90 text-foreground shadow-sm transition-transform hover:scale-105"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeImage(image.id);
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    <span className="absolute bottom-1.5 left-1.5 grid h-5 w-5 place-items-center rounded-md bg-surface/85 text-muted-foreground">
                      <GripVertical className="h-3.5 w-3.5" />
                    </span>
                    {typeof image.uploadProgress === "number" &&
                    image.uploadProgress < 100 ? (
                      <div className="absolute inset-x-0 bottom-0 bg-surface/90 p-1">
                        <Progress value={image.uploadProgress} className="h-1" />
                      </div>
                    ) : null}
                    {!image.url &&
                    (image.uploadProgress === undefined ||
                      image.uploadProgress >= 100) ? (
                      <button
                        type="button"
                        className="absolute inset-0 bg-brand-foreground/50 text-[10px] font-medium text-surface"
                        onClick={(e) => {
                          e.stopPropagation();
                          void retryUpload(image.id);
                        }}
                      >
                        Retry
                      </button>
                    ) : null}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-[13px]">
              <div className="flex items-center gap-4">
                <span className="font-medium">
                  {images.length} photo{images.length === 1 ? "" : "s"} uploaded
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40"
                  onClick={rotateOrder}
                  disabled={disabled || images.length < 2}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Reorder
                </button>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 text-destructive hover:opacity-80 disabled:opacity-40"
                onClick={clearAll}
                disabled={disabled}
              >
                Clear all <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={onDrop}
        className={cn(
          "relative overflow-hidden rounded-[28px] border border-dashed text-center transition-all duration-300",
          compact ? "p-8" : "px-8 py-14 sm:py-16",
          dragging
            ? "border-zinc-900 bg-zinc-50 shadow-sm"
            : "border-zinc-300 bg-white",
        )}
      >
        <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />
        <div
          className={cn(
            "mx-auto mb-5 flex items-center justify-center rounded-[24px] bg-zinc-100 text-zinc-700",
            compact ? "size-14" : "size-16",
          )}
        >
          <Package className={compact ? "size-7" : "size-8"} />
        </div>
        <p className="text-lg font-semibold tracking-tight text-zinc-950 sm:text-xl">
          Drop your photos
        </p>
        <p className="mt-2 text-sm text-zinc-500">or browse your computer</p>
        <Button
          type="button"
          className="mt-4 rounded-full bg-zinc-950 px-6 text-white hover:bg-zinc-800"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="size-4" />
          Choose photos
        </Button>
        <p className="mt-5 text-xs text-zinc-500">
          Up to {DEFAULT_VALUES.maxImages} photos · full resolution for eBay
          (max {DEFAULT_VALUES.maxImageSizeMb}MB each)
        </p>
        {fileInput}
      </div>

      {images.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image, index) => (
            <div
              key={image.id}
              className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="relative aspect-[4/3] bg-zinc-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.previewUrl || image.url}
                  alt={image.fileName}
                  className="size-full object-cover"
                />
                {image.isPrimary ? (
                  <Badge className="absolute left-3 top-3 bg-zinc-950 text-white">
                    Primary
                  </Badge>
                ) : null}
              </div>
              <div className="space-y-2 p-3">
                <div className="truncate text-xs text-zinc-500">
                  {image.fileName}
                </div>
                {typeof image.uploadProgress === "number" &&
                image.uploadProgress < 100 ? (
                  <Progress value={image.uploadProgress} />
                ) : (
                  <div
                    className={cn(
                      "text-xs",
                      image.url ? "text-emerald-600" : "text-amber-700",
                    )}
                  >
                    {image.url ? "Ready" : "Upload failed · retry"}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {!image.url ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => void retryUpload(image.id)}
                    >
                      Retry
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => setPrimary(image.id)}
                  >
                    <Star className="size-3.5" />
                    Primary
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => moveImage(index, index - 1)}
                  >
                    <GripVertical className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="rounded-full"
                    onClick={() => removeImage(image.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
