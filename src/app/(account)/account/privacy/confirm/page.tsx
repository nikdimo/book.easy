import Link from "next/link";
import { requireUserPage } from "@/lib/auth-helpers";
import { checkDeletionToken } from "@/lib/services/account-deletion.service";
import { ConfirmDeletion } from "@/components/account/confirm-deletion";
import { getT, T, t } from "@/lib/i18n/t";

export const metadata = { title: "Confirm account deletion" };

export default async function ConfirmDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const translator = await getT();
  const { token } = await searchParams;
  const user = await requireUserPage(
    `/account/privacy/confirm${token ? `?token=${token}` : ""}`
  );

  // Read-only check. The account is deleted only when the user presses confirm, so
  // link scanners and mail previews opening this URL can't destroy anything.
  const check = token ? await checkDeletionToken(token) : ({ valid: false, reason: "invalid" } as const);
  const belongsToViewer = check.valid && check.userId === user.id;

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold"><T t={translator} k="account.deletion.heading" source="Confirm account deletion" /></h1>

      {check.valid && belongsToViewer ? (
        <ConfirmDeletion token={token!} email={check.email} />
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            {!check.valid && check.reason === "expired"
              ? t(translator, "account.deletion.expired", "This confirmation link has expired.")
              : !check.valid && check.reason === "used"
                ? t(translator, "account.deletion.used", "This confirmation link has already been used.")
                : !check.valid
                  ? t(translator, "account.deletion.invalid", "This confirmation link is not valid.")
                  : t(translator, "account.deletion.different_account", "This confirmation link belongs to a different account.")}
          </p>
          <p>
            <Link
              href="/account/privacy"
              className="underline underline-offset-4 hover:text-foreground"
            >
              <T t={translator} k="account.deletion.back" source={"Back to Data & Privacy"} />
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
