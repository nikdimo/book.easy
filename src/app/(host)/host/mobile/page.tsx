import Link from "next/link";
import { ExternalLink, MonitorSmartphone, Play, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Mobile App Preview" };

const previewUrl = process.env.MOBILE_PREVIEW_URL ?? "http://localhost:8081";

export default function MobilePreviewPage() {
  return (
    <div className="mx-auto flex h-full min-h-[720px] max-w-7xl flex-col px-4 py-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm md:text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            <MonitorSmartphone className="size-4" />
            React Native workspace
          </div>
          <h1 className="text-2xl font-bold">Mobile app preview</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Test the neutral-branded host application against the same account, properties,
            bookings, and availability as this control panel.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={previewUrl} target="_blank" rel="noreferrer">
            Open standalone <ExternalLink className="size-4" />
          </Link>
        </Button>
      </div>

      <div className="grid min-h-0 flex-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-h-[720px] overflow-hidden rounded-3xl border bg-[#f5f6f3] shadow-sm">
          <iframe
            src={previewUrl}
            title="Property Host mobile app"
            className="h-full min-h-[720px] w-full"
            allow="clipboard-read; clipboard-write"
          />
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center gap-2 font-semibold">
              <Play className="size-4 text-primary" />
              Start the preview
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Keep the main web app running, then start the Expo web server in a second
              terminal.
            </p>
            <code className="mt-3 flex items-center gap-2 rounded-xl bg-muted px-3 py-3 text-sm md:text-xs">
              <Terminal className="size-4 shrink-0" />
              npm run mobile:preview
            </code>
          </div>

          <div className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold">Available now</h2>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>• Google and email-link host login</li>
              <li>• Live dashboard statistics</li>
              <li>• Properties and saved drafts</li>
              <li>• Booking confirmation, rejection, and cancellation</li>
              <li>• Web-matched availability and pricing calendar</li>
              <li>• Booking-linked inbox and chat</li>
              <li>• Booking/chat notifications with unread badge</li>
              <li>• The same 16 enabled interface languages</li>
              <li>• Complete existing listing builder</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <h2 className="font-semibold text-primary">Branding is temporary</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The app uses “Property Host” only as an internal development name. Store
              name, logo, colors, domain, and public identity remain changeable.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
