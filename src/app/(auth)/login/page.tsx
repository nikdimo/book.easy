import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";
import { localDevAuthEnabled } from "@/lib/auth/local-dev-auth";

export const metadata = {
  title: "Log In",
  description: "Log in to your Linger Homes account",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm localDevLogin={localDevAuthEnabled()} />
    </Suspense>
  );
}
