import { AppShell } from "@/components/layout/app-shell";
import { SettingsStudio } from "@/components/settings/settings-studio";

export default function SettingsPage() {
  return (
    <AppShell hideHeader>
      <SettingsStudio />
    </AppShell>
  );
}
