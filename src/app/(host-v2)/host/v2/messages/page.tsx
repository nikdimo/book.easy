import { MessageCircle } from "lucide-react";
import { getT, T } from "@/lib/i18n/t";

/**
 * What fills the thread column before a thread is chosen — desktop only. Below `lg` the
 * shell hides this side entirely and gives the whole screen to the list, which is the
 * real answer to "nothing is selected" on a phone.
 */
export default async function HostV2MessagesPage() {
  const t = await getT();

  return (
    <div className="hidden min-h-0 flex-1 flex-col items-center justify-center rounded-3xl bg-white text-center shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_30px_-14px_rgba(15,23,42,0.22)] lg:flex">
      <span className="grid size-14 place-items-center rounded-full bg-slate-50 text-slate-400">
        <MessageCircle className="size-6" aria-hidden />
      </span>
      <p className="mt-4 text-base font-semibold tracking-tight text-slate-900">
        <T t={t} k="host.v2.messages.select_title" source="Choose a conversation" />
      </p>
      <p className="mt-1 max-w-xs text-sm leading-6 text-slate-500">
        <T
          t={t}
          k="host.v2.messages.select_copy"
          source="Pick a guest on the left to read the thread and see their reservation."
        />
      </p>
    </div>
  );
}
