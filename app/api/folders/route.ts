import { getFolderTree, createFolder } from "@/lib/data/folders";
import { createFolderSchema } from "@/lib/validation/schemas";
import { handle, json, parseBody } from "@/lib/data/respond";

export async function GET() {
  return handle(async () => json(await getFolderTree()));
}

export async function POST(req: Request) {
  return handle(async () => {
    const { name, parentId } = await parseBody(req, createFolderSchema);
    const folder = await createFolder(name, parentId ?? null);
    return json(folder, 201);
  });
}
