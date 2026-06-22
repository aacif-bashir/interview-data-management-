import { moveFolder } from "@/lib/data/folders";
import { moveFolderSchema } from "@/lib/validation/schemas";
import { handle, json, parseBody } from "@/lib/data/respond";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const { newParentId } = await parseBody(req, moveFolderSchema);
    return json(await moveFolder(id, newParentId));
  });
}
