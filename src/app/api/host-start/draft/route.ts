import { NextResponse } from "next/server";
import {
  publishHostStartDraft,
  saveHostStartDraftPatch,
} from "@/lib/actions/host-start.actions";

export async function PATCH(request: Request) {
  try {
    const result = await saveHostStartDraftPatch(await request.json());
    return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Your changes could not be saved." },
      { status: 401 },
    );
  }
}

export async function POST() {
  try {
    const result = await publishHostStartDraft();
    return NextResponse.json(result, { status: "error" in result ? 400 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The listing could not be published." },
      { status: 401 },
    );
  }
}
