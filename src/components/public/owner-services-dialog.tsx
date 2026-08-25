"use client";

import {
  BadgeCheck,
  CalendarSync,
  CreditCard,
  LineChart,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tx, useI18n } from "@/lib/i18n/client";

export function OwnerServicesDialog() {
  const { resolve } = useI18n();

  const steps = [
    {
      icon: BadgeCheck,
      title: resolve(
        "home.services.free_platform_title",
        "Discover and book directly",
      ).text,
      description: resolve(
        "home.services.free_platform_description",
        "Hosts list for free, guests browse without service fees, and both sides communicate directly.",
      ).text,
    },
    {
      icon: CreditCard,
      title: resolve(
        "home.services.direct_agreement_title",
        "Agree the booking together",
      ).text,
      description: resolve(
        "home.services.direct_agreement_description",
        "The host confirms the price, terms, and payment method with the guest. Linger Homes does not collect or hold booking payments.",
      ).text,
    },
    {
      icon: CalendarSync,
      title: resolve(
        "home.services.channels_title",
        "Work across every channel",
      ).text,
      description: resolve(
        "home.services.channels_description",
        "We can help prepare, publish, and manage listings on Linger Homes and major platforms such as Airbnb and Booking.com, while keeping calendars connected.",
      ).text,
    },
    {
      icon: LineChart,
      title: resolve(
        "home.services.optimize_title",
        "Optimize bookings",
      ).text,
      description: resolve(
        "home.services.optimize_description",
        "Optional services cover listing setup, channel management, pricing, and booking optimization. These paid extras fund the free platform.",
      ).text,
    },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          size="lg"
          variant="outline"
          className="rounded-full border-slate-300 bg-white px-7 text-slate-900 shadow-sm hover:bg-white md:h-11"
        >
          <Tx k="home.owner_hero.how_it_works" source="How it works" />
        </Button>
      </DialogTrigger>
      <DialogContent
        variant="sheet"
        className="overflow-y-auto bg-background md:max-w-3xl"
        style={{ maxHeight: "86dvh" }}
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="text-xl md:text-2xl">
            <Tx
              k="home.services.title"
              source="A free direct-booking platform, backed by optional services"
            />
          </DialogTitle>
          <DialogDescription>
            <Tx
              k="home.services.description"
              source="Linger Homes connects hosts and guests directly. We complement major booking platforms and help owners manage the wider business around them."
            />
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="bg-background p-4 md:p-5">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold tracking-wider text-muted-foreground">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl bg-primary/7 p-4">
          <h3 className="font-semibold">
            <Tx k="home.services.why_free_title" source="Why is it free?" />
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            <Tx
              k="home.services.why_free_description"
              source="We do not charge hosts to list or guests to book through Linger Homes. Our business earns from optional setup, management, channel, and pricing services chosen by property owners."
            />
          </p>
        </div>

        <div className="rounded-xl border p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">
              <Tx k="home.services.safety_title" source="Safer direct hosting" />
            </h3>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            <Tx
              k="home.services.safety_description"
              source="Hosts should use appropriate short-term-rental insurance, confirm booking and cancellation terms in writing, use secure traceable payment methods, and follow local registration, tax, and guest-reporting rules. Verify the lead guest's identity only where lawful and necessary, and handle personal information securely."
            />
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            <Tx
              k="home.services.safety_note"
              source="Requirements differ by country and property. Hosts remain responsible for their agreements, payments, insurance, and legal compliance."
            />
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
