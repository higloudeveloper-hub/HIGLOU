export type WizardStep =
  | "photos"
  | "analyzing"
  | "reveal"
  | "review"
  | "export";

/** User-facing progress: Photos → AI Draft → Edit → Publish. */
export const WIZARD_PROGRESS_STEPS = [
  { id: "photos", label: "Photos", shortLabel: "1" },
  { id: "analyzing", label: "AI Draft", shortLabel: "2" },
  { id: "review", label: "Edit", shortLabel: "3" },
  { id: "export", label: "Publish", shortLabel: "4" },
] as const;

export const WIZARD_STEP_COPY: Record<
  (typeof WIZARD_PROGRESS_STEPS)[number]["id"],
  { title: string; subtitle: string }
> = {
  photos: {
    title: "Add your photos",
    subtitle: "That’s the only hard part. Higlou drafts the rest.",
  },
  analyzing: {
    title: "Reading your product",
    subtitle: "Title, category, and specifics are being drafted now.",
  },
  review: {
    title: "Check the draft",
    subtitle: "Fix anything that looks off, then go to publish.",
  },
  export: {
    title: "Publish",
    subtitle: "Send a draft to eBay, or download a CSV.",
  },
};

export function wizardStepToProgressIndex(step: WizardStep): number {
  switch (step) {
    case "photos":
      return 0;
    case "analyzing":
    case "reveal":
      return 1;
    case "review":
      return 2;
    case "export":
      return 3;
    default:
      return 0;
  }
}

export function wizardStepOfLabel(step: WizardStep, exported = false): string {
  if (exported) {
    return `${WIZARD_PROGRESS_STEPS.length} of ${WIZARD_PROGRESS_STEPS.length}`;
  }
  const index = wizardStepToProgressIndex(step);
  return `${index + 1} of ${WIZARD_PROGRESS_STEPS.length}`;
}

export function wizardProgressMeta(
  step: WizardStep,
  exported = false,
): { title: string; subtitle: string; stepOf: string; index: number } {
  const index = exported
    ? WIZARD_PROGRESS_STEPS.length - 1
    : wizardStepToProgressIndex(step);
  const id = WIZARD_PROGRESS_STEPS[index]?.id ?? "photos";
  const copy = WIZARD_STEP_COPY[id];
  return {
    title: copy.title,
    subtitle: copy.subtitle,
    stepOf: wizardStepOfLabel(step, exported),
    index,
  };
}
