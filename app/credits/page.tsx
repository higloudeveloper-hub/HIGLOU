import { AppShell } from "@/components/layout/app-shell";
import { CreditsStudio } from "@/components/credits/credits-studio";

export default function CreditsPage() {
  return (
    <AppShell hideHeader flush>
      <CreditsStudio />
    </AppShell>
  );
}
