import { deleteListingDraft } from "@/lib/actions/listing.actions";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;
  const { id } = await context.params;
  const result = await deleteListingDraft(id);
  if (result && "error" in result) {
    return mobileJson(request, result, { status: 400 });
  }
  return mobileJson(request, { success: true });
}
