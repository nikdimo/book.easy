import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = {
  title: "Check your email",
};

export default function CheckEmailPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Check your email</CardTitle>
        <CardDescription>
          We sent you a sign-in link. Open it on this device to continue.
        </CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
