import { deleteListing, unpublishListing } from "@/lib/actions/listing.actions";
import { mobileJson, mobileOptions, requireMobileHost } from "@/lib/mobile-api";

export async function OPTIONS(request: Request) {
  return mobileOptions(request);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;
  const { id } = await context.params;

  let input: { action?: "unpublish" };
  try {
    input = await request.json();
  } catch {
    return mobileJson(request, { error: "Invalid JSON body" }, { status: 400 });
  }
  if (input.action !== "unpublish") {
    return mobileJson(request, { error: "Unsupported listing action" }, { status: 400 });
  }

  const result = await unpublishListing(id);
  if (result?.error) return mobileJson(request, result, { status: 400 });
  return mobileJson(request, result);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const access = await requireMobileHost(request);
  if ("response" in access) return access.response;
  const { id } = await context.params;

  const result = await deleteListing(id);
  if ("error" in result) return mobileJson(request, result, { status: 400 });
  return mobileJson(request, result);
}
