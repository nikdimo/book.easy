import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SafetyCaseForm } from "@/components/support/safety-case-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserPage } from "@/lib/auth-helpers";

const targetTypes = ["USER", "HOST", "LISTING", "BOOKING", "MESSAGE"] as const;

export const metadata = { title: "Contact Support" };

export default async function NewSafetyCasePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUserPage("/account/support/new");
  const query = await searchParams;
  const type = query.type === "CLAIM" ? "CLAIM" : "REPORT";
  const requestedTarget = typeof query.targetType === "string" ? query.targetType : "";
  const targetType = targetTypes.includes(requestedTarget as (typeof targetTypes)[number])
    ? (requestedTarget as (typeof targetTypes)[number])
    : type === "CLAIM"
      ? "BOOKING"
      : "LISTING";

  return (
    <div className="mx-auto max-w-2xl">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link href="/account/support"><ArrowLeft className="mr-1 h-4 w-4" /> Support cases</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{type === "CLAIM" ? "Submit a booking claim" : "Submit a report"}</CardTitle>
          <p className="text-sm text-muted-foreground">
            Your reference and every update will be kept in your account.
          </p>
        </CardHeader>
        <CardContent>
          <SafetyCaseForm
            type={type}
            targetType={targetType}
            listingId={typeof query.listingId === "string" ? query.listingId : undefined}
            bookingId={typeof query.bookingId === "string" ? query.bookingId : undefined}
            messageId={typeof query.messageId === "string" ? query.messageId : undefined}
            reportedUserId={typeof query.reportedUserId === "string" ? query.reportedUserId : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}
