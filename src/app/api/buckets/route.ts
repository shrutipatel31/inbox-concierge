import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBuckets, addBucket } from "@/lib/cache";
import { generateBucketDescription } from "@/lib/classifier";

const MAX_NAME_LENGTH = 40;
const MAX_DESCRIPTION_LENGTH = 240;

/** GET /api/buckets — current bucket set for the session. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json({ buckets: getBuckets(session.user.email) });
}

interface AddBucketBody {
  name?: unknown;
  description?: unknown;
}

/** POST /api/buckets — add a custom bucket; auto-describes when blank. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const key = session.user.email;

  const body = (await request.json().catch(() => ({}))) as AddBucketBody;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  let description =
    typeof body.description === "string" ? body.description.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Name must be ${MAX_NAME_LENGTH} characters or fewer.` },
      { status: 400 },
    );
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json(
      {
        error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`,
      },
      { status: 400 },
    );
  }
  const existing = getBuckets(key);
  if (existing.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
    return NextResponse.json(
      { error: `A bucket named "${name}" already exists.` },
      { status: 400 },
    );
  }

  try {
    if (!description) description = await generateBucketDescription(name);
    const buckets = addBucket(key, { name, description });
    return NextResponse.json({ buckets });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to add bucket";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
