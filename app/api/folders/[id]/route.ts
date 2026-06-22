import {
  getFolderWithBreadcrumb,
  renameFolder,
  deleteFolder,
} from "@/lib/data/folders";
import { renameFolderSchema } from "@/lib/validation/schemas";
import { handle, json, parseBody } from "@/lib/data/respond";
import type { NextRequest } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    return json(await getFolderWithBreadcrumb(id));
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const { name } = await parseBody(req, renameFolderSchema);
    return json(await renameFolder(id, name));
  });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const cascade = req.nextUrl.searchParams.get("cascade") === "true";
    return json(await deleteFolder(id, cascade));
  });
}
