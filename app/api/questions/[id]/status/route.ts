import { setStatus } from "@/lib/data/questions";
import { statusUpdateSchema } from "@/lib/validation/schemas";
import { handle, json, parseBody } from "@/lib/data/respond";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const { status } = await parseBody(req, statusUpdateSchema);
    return json(await setStatus(id, status));
  });
}
