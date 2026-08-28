import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getT, T } from "@/lib/i18n/t";

export const metadata = {
  title: "Check your email",
};

export default async function CheckEmailPage() {
  const translator = await getT();
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">
          <T t={translator} k="auth.check_email.title" source="Check your email" />
        </CardTitle>
        <CardDescription>
          <T
            t={translator}
            k="auth.check_email.body"
            source="We sent you a sign-in link. Open it on this device to continue."
          />
        </CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
