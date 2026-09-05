import { HostV2Shell } from "@/components/host/v2/host-v2-shell";
import { RegionalSettingsLauncher } from "@/components/shared/regional-settings-launcher";
import { requireHostPage } from "@/lib/auth-helpers";

export default async function HostV2Layout({ children }: { children: React.ReactNode }) {
  const user = await requireHostPage("/host");
  return (
    <HostV2Shell
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.role === "ADMIN"}
      regionalSettings={<RegionalSettingsLauncher hideTrigger />}
    >
      {children}
    </HostV2Shell>
  );
}
