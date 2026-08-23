import { HostV2Shell } from "@/components/host/v2/host-v2-shell";
import { RegionalSettingsLauncher } from "@/components/shared/regional-settings-launcher";
import { requireHostPage } from "@/lib/auth-helpers";
import { getT } from "@/lib/i18n/t";

export default async function HostV2Layout({ children }: { children: React.ReactNode }) {
  const [user, t] = await Promise.all([requireHostPage("/host"), getT()]);
  return (
    <HostV2Shell
      userName={user.name}
      userEmail={user.email}
      isAdmin={user.role === "ADMIN"}
      regionalSettings={<RegionalSettingsLauncher hideTrigger />}
      t={t}
    >
      {children}
    </HostV2Shell>
  );
}
