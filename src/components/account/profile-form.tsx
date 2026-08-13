"use client";

import { useActionState } from "react";
import { updateProfile } from "@/lib/actions/profile.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Tx, useI18n } from "@/lib/i18n/client";

interface ProfileFormProps {
  user: { name: string; email: string };
  profile: { phone: string; bio: string };
}

export function ProfileForm({ user, profile }: ProfileFormProps) {
  const { resolve } = useI18n();
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | undefined, formData: FormData) => {
      const result = await updateProfile(formData);
      if (result?.success) toast.success(resolve("account.profile.updated", "Profile updated").text);
      return result;
    },
    undefined
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle><Tx k="account.profile.personal_information" source="Personal Information" /></CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {state?.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
          <div className="space-y-2">
            <Label htmlFor="name"><Tx k="account.profile.full_name" source="Full name" /></Label>
            <Input id="name" name="name" defaultValue={user.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email"><Tx k="account.profile.email" source="Email" /></Label>
            <Input id="email" value={user.email} disabled />
            <p className="text-xs text-muted-foreground"><Tx k="account.profile.email_locked" source="Email changes are not supported yet" /></p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone"><Tx k="account.profile.phone" source="Phone" /></Label>
            <Input id="phone" name="phone" type="tel" defaultValue={profile.phone} />
          </div>
          <div className="space-y-2">
            {/* "Bio" alone is ambiguous to machine translation — Google Translate
                reads it as the verb and renders Macedonian "Беше" ("was"). The
                fuller phrase translates correctly. */}
            <Label htmlFor="bio"><Tx k="account.profile.about" source="About you" /></Label>
            <Textarea id="bio" name="bio" defaultValue={profile.bio} rows={3} />
          </div>
          <Button type="submit" disabled={isPending}>
            {isPending
              ? resolve("common.saving", "Saving...").text
              : resolve("account.profile.save", "Save Changes").text}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
