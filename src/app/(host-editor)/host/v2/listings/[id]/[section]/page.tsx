import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { requireHostPage } from "@/lib/auth-helpers";
import { findEditorSection } from "@/lib/host/v2/editor-sections";
import { getListingEditorHeader } from "@/lib/services/listing-editor.service";
import { getT, T } from "@/lib/i18n/t";
import { EditorFrame } from "@/components/host/v2/editor/editor-frame";

/**
 * Every editor section that is still to be built.
 *
 * They are real routes rather than dead navigation items: a host who clicks "Pricing"
 * gets a sentence explaining where it lives today and a way to get there, which is a
 * great deal better than a link that swallows the click.
 */
export default async function EditorSectionPlaceholder({
  params,
}: {
  params: Promise<{ id: string; section: string }>;
}) {
  const { id, section: slug } = await params;
  const section = findEditorSection(slug);
  // `photos` has its own route, so reaching this file with it means the slug is junk.
  if (!section || section.built) notFound();

  const [user, t] = await Promise.all([requireHostPage(), getT()]);
  const listing = await getListingEditorHeader(id, user.id);
  if (!listing) notFound();

  const label = t.resolve(section.key, section.source);

  return (
    <EditorFrame
      listingId={id}
      section={slug}
      complete={listing.completeSections}
    >
      <div className="flex flex-1 items-center justify-center py-16">
        <div className="max-w-sm text-center">
          <h2 className="text-lg font-medium text-slate-900">
            <span className={label.translated ? "notranslate" : undefined}>
              {label.text}
            </span>
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            <T
              t={t}
              k="host.editor.section_pending"
              source="This section is moving into the new editor. For now you can still edit it in the classic listing editor."
            />
          </p>
          <Link
            href={`/host/listings/${id}/edit`}
            className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#fde7dc] px-5 text-sm font-semibold text-[#8f3d21] transition-colors hover:bg-[#f9d7c6] focus-visible:bg-[#f9d7c6] focus-visible:outline-none"
          >
            <T t={t} k="host.editor.open_classic_cta" source="Open the classic editor" />
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </EditorFrame>
  );
}
