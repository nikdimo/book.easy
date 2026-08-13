"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addSafetyCaseReplyAction } from "@/lib/actions/communication.actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/client";

export function SafetyCaseReply({ caseId }: { caseId: string }) {
  const { resolve } = useI18n();
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
        placeholder={resolve("support.reply_placeholder", "Add more information...").text}
      />
      <Button disabled={pending || body.trim().length < 2} onClick={() => void send()}>
        {pending
          ? resolve("common.sending", "Sending...").text
          : resolve("support.send_update", "Send update").text}
      </Button>
    </div>
  );
}
