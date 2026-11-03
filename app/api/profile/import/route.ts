import { NextResponse, type NextRequest } from "next/server";
import { aiErrorMessage, runAiTask } from "@/lib/ai/runner";
import { IMPORT_RESUME, importResumePrompt } from "@/lib/ai/tasks";
import { extractResumeText, MAX_UPLOAD_BYTES, sniffKind, UploadError } from "@/lib/profile/extract-text";
import { importToProfile } from "@/lib/profile/from-import";
import { profileDocSchema } from "@/lib/profile/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

// Reads an uploaded resume and returns a DRAFT profile for the person to
// review in the editor. Nothing is saved here.
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in to import a resume." }, { status: 401 });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Files must be under 5 MB." }, { status: 413 });
  }

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return NextResponse.json({ error: "Upload a PDF, DOCX or Markdown file." }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "Choose a file to import." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "Files must be under 5 MB." }, { status: 413 });

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffKind(bytes, file.name);
    const text = await extractResumeText(bytes, kind);
    const result = await runAiTask(auth.user.id, IMPORT_RESUME, importResumePrompt(text));
    const draft = importToProfile(result.data, auth.user.email ?? "");
    const checked = profileDocSchema.safeParse(draft);
    if (!checked.success) {
      return NextResponse.json({ error: "We read the file but couldn't turn it into a profile. Try a DOCX version." }, { status: 422 });
    }
    return NextResponse.json({ profile: checked.data });
  } catch (err) {
    if (err instanceof UploadError) return NextResponse.json({ error: err.message }, { status: 400 });
    return NextResponse.json({ error: aiErrorMessage(err) }, { status: 502 });
  }
}
