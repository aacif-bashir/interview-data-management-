import { setFavorite } from "@/lib/data/questions";
import { favoriteUpdateSchema } from "@/lib/validation/schemas";
import { handle, json, parseBody } from "@/lib/data/respond";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const { favorite } = await parseBody(req, favoriteUpdateSchema);
    return json(await setFavorite(id, favorite));
  });
}
