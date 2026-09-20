import { AppShell } from "@/components/layout/app-shell";
import { ConnectStudio } from "@/components/connect/connect-studio";

export default function ConnectPage() {
  return (
    <AppShell hideHeader flush>
      <ConnectStudio />
    </AppShell>
  );
}
