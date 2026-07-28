"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addSafetyCaseReplyAction } from "@/lib/actions/communication.actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function SafetyCaseReply({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  async function send() {
    setPending(true);
    const result = await addSafetyCaseReplyAction(caseId, body);
    setPending(false);
    if (result.error) return toast.error(result.error);
    setBody("");
    router.refresh();
  }
  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={3000}
        placeholder="Add more information..."
      />
      <Button disabled={pending || body.trim().length < 2} onClick={() => void send()}>
        {pending ? "Sending..." : "Send update"}
      </Button>
    </div>
  );
}
