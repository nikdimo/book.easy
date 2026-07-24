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

interface BecomeHostFormProps {
  existingPhone: string;
  userName: string;
}

export function BecomeHostForm({ existingPhone, userName }: BecomeHostFormProps) {
  const { update } = useSession();
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);

  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | undefined, formData: FormData) => {
      const result = await becomeHost(formData);
      if (result?.success) {
        toast.success("Welcome! You are now a host.");
        await update({ isHost: true });
        router.push("/host/listings/new");
      }
      return result;
    },
    undefined
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Host Information</CardTitle>
        <CardDescription>Tell us a bit about yourself so guests know who they are booking with.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="hostDisplayName">Display name</Label>
            <Input
              id="hostDisplayName"
              name="hostDisplayName"
              defaultValue={userName.split(" ")[0]}
              placeholder="How guests will see your name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone number *</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={existingPhone}
              required
              placeholder="+389 7X XXX XXX"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hostBio">Host bio</Label>
            <Textarea
              id="hostBio"
              name="hostBio"
              rows={4}
              placeholder="Tell potential guests about yourself, your hosting style, and what makes your properties special..."
            />
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox
              checked={agreed}
              onCheckedChange={(c) => setAgreed(c === true)}
              className="mt-0.5"
            />
            <span className="text-sm text-muted-foreground">
              I agree to the book.easy.mk host terms of service and understand that my listings
              are subject to platform review and approval.
            </span>
          </label>
          <Button type="submit" disabled={isPending || !agreed} className="w-full">
            {isPending ? "Setting up..." : "Activate Host Account"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
