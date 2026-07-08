import { HostSidebar } from "@/components/host/host-sidebar";

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row min-h-screen bg-background">
      <HostSidebar />
      <main className="flex-1 min-w-0 min-h-0">{children}</main>
    </div>
  );
}
