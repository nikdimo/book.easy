import Link from "next/link";
import { requireUserPage } from "@/lib/auth-helpers";
import { checkDeletionToken } from "@/lib/services/account-deletion.service";
import { ConfirmDeletion } from "@/components/account/confirm-deletion";

export const metadata = { title: "Confirm account deletion" };

export default async function ConfirmDeletionPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
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
      <h1 className="text-2xl font-bold">Confirm account deletion</h1>

      {check.valid && belongsToViewer ? (
        <ConfirmDeletion token={token!} email={check.email} />
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            {!check.valid && check.reason === "expired"
              ? "This confirmation link has expired."
              : !check.valid && check.reason === "used"
                ? "This confirmation link has already been used."
                : !check.valid
                  ? "This confirmation link is not valid."
                  : "This confirmation link belongs to a different account."}
          </p>
          <p>
            <Link
              href="/account/privacy"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Back to Data &amp; Privacy
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
