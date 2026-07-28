"use client";

import { useState } from "react";
import type { SafetyCasePriority, SafetyCaseStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateSafetyCaseAdminAction } from "@/lib/actions/communication.actions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const statuses: SafetyCaseStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "AWAITING_INFORMATION",
  "RESOLVED",
  "REJECTED",
];

export function SafetyCaseControls({
  caseId,
  initialStatus,
  initialPriority,
}: {
  caseId: string;
  initialStatus: SafetyCaseStatus;
  initialPriority: SafetyCasePriority;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [priority, setPriority] = useState(initialPriority);
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [internal, setInternal] = useState(false);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    const result = await updateSafetyCaseAdminAction({
      caseId,
      status,
      priority,
      note,
      resolution,
      internal,
      assignToSelf: true,
    });
    setPending(false);
    if (result.error) return toast.error(result.error);
    toast.success("Case updated");
    setNote("");
    router.refresh();
  }

  const closing = status === "RESOLVED" || status === "REJECTED";
  return (
    <div className="space-y-4 rounded-xl border p-4">
      <h2 className="font-semibold">Case controls</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="case-status">Status</Label>
          <select
            id="case-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as SafetyCaseStatus)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            {statuses.map((value) => (
              <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="case-priority">Priority</Label>
          <select
            id="case-priority"
            value={priority}
            onChange={(event) => setPriority(event.target.value as SafetyCasePriority)}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            <option value="NORMAL">NORMAL</option>
            <option value="URGENT">URGENT</option>
          </select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="case-note">Update or note</Label>
        <Textarea
          id="case-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Public reply by default"
        />
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="internal-note"
          checked={internal}
          onCheckedChange={(checked) => setInternal(checked === true)}
        />
        <Label htmlFor="internal-note">Internal note — do not notify the customer</Label>
      </div>
      {closing ? (
        <div className="space-y-2">
          <Label htmlFor="resolution">Resolution (required)</Label>
          <Textarea
            id="resolution"
            value={resolution}
            onChange={(event) => setResolution(event.target.value)}
          />
        </div>
      ) : null}
      <Button disabled={pending || (closing && !resolution.trim())} onClick={() => void save()}>
        {pending ? "Saving..." : "Assign to me and save"}
      </Button>
    </div>
  );
}
