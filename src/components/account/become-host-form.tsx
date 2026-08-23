"use client";

import { useActionState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { becomeHost } from "@/lib/actions/profile.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { useState } from "react";
import { Tx, useI18n } from "@/lib/i18n/client";

interface BecomeHostFormProps {
  existingPhone: string;
  userName: string;
}

export function BecomeHostForm({ existingPhone, userName }: BecomeHostFormProps) {
  const { resolve } = useI18n();
  const { update } = useSession();
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | undefined, formData: FormData) => {
      const result = await becomeHost(formData);
      if (result?.success) {
        toast.success(resolve("account.become_host.success", "Welcome! You are now a host.").text);
        await update({ isHost: true });
        // Through the panel route rather than straight to a page: it records the
        // panel choice in a cookie, so the next "Switch to hosting" lands here too.
        // A brand-new host has no preference to honour, and v2 is the panel we want
        // them to start in.
        router.push("/host/panel");
      }
      return result;
    },
    undefined
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle><Tx k="account.become_host.form_title" source="Host Information" /></CardTitle>
        <CardDescription><Tx k="account.become_host.form_description" source="Tell us a bit about yourself so guests know who they are booking with." /></CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="hostDisplayName"><Tx k="account.become_host.display_name" source="Display name" /></Label>
            <Input
              id="hostDisplayName"
              name="hostDisplayName"
              defaultValue={userName.split(" ")[0]}
              placeholder={resolve("account.become_host.display_name_placeholder", "How guests will see your name").text}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone"><Tx k="account.become_host.phone" source="Phone number *" /></Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={existingPhone}
              required
              placeholder={resolve("account.become_host.phone_placeholder", "+389 7X XXX XXX").text}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hostBio"><Tx k="account.become_host.bio" source="Host bio" /></Label>
            <Textarea
              id="hostBio"
              name="hostBio"
              rows={4}
              placeholder={resolve("account.become_host.bio_placeholder", "Tell potential guests about yourself, your hosting style, and what makes your properties special...").text}
            />
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              checked={agreed}
              onCheckedChange={(c) => setAgreed(c === true)}
              className="mt-0.5"
            />
            <span className="text-sm text-muted-foreground">
              <Tx k="account.become_host.terms" source="I agree to the Linger Homes host terms of service and understand that my listings are subject to platform review and approval." />
            </span>
          </label>
          <Button type="submit" disabled={isPending || !agreed} className="w-full">
            {isPending
              ? resolve("account.become_host.setting_up", "Setting up...").text
              : resolve("account.become_host.activate", "Activate Host Account").text}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
