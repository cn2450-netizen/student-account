import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readFile } from "fs/promises";
import { getCurrentSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getBackupConfig, listBackupFiles } from "@/lib/backup";

export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session?.user || !can(session.user.role, "settings")) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const fileParam = req.nextUrl.searchParams.get("file");
  if (!fileParam) return new NextResponse("Missing file parameter", { status: 400 });

  const cfg = await getBackupConfig();
  // Only allow downloading a file that's actually present in the backup
  // directory listing — never join the raw query param onto a filesystem
  // path, so path traversal (e.g. "../../etc/passwd") can't match anything.
  const files = await listBackupFiles(cfg.destinationPath);
  const match = files.find((f) => f.name === fileParam);
  if (!match) return new NextResponse("File not found", { status: 404 });

  const buffer = await readFile(path.join(cfg.destinationPath, match.name));

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${match.name}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
