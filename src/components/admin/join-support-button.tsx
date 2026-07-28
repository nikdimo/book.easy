"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Headphones } from "lucide-react";
import { toast } from "sonner";
import { joinConversationAsSupportAction } from "@/lib/actions/communication.actions";
import { Button } from "@/components/ui/button";

export function JoinSupportButton({
  conversationId,
  joined,
}: {
  conversationId: string;
  joined: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function join() {
    if (joined) return router.push(`/messages/${conversationId}`);
    setPending(true);
    const result = await joinConversationAsSupportAction(conversationId);
    setPending(false);
    if (result.error) return toast.error(result.error);
    router.push(`/messages/${conversationId}`);
  }
  return (
    <Button onClick={() => void join()} disabled={pending}>
      <Headphones className="mr-2 h-4 w-4" />
      {pending ? "Joining..." : joined ? "Open support thread" : "Join as support"}
    </Button>
  );
}
