"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deactivateUser, reactivateUser } from "@/lib/actions/admin.actions";
import { toast } from "sonner";

export function AdminUserActions({ userId, isActive }: { userId: string; isActive: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant={isActive ? "destructive" : "default"}
      size="sm"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = isActive
            ? await deactivateUser(userId)
            : await reactivateUser(userId);
          if (result && "error" in result && typeof result.error === "string") {
            toast.error(result.error);
          }
          else {
            toast.success(isActive ? "User deactivated" : "User reactivated");
            router.refresh();
          }
        });
      }}
    >
      {isPending ? "..." : isActive ? "Deactivate" : "Reactivate"}
    </Button>
  );
}
