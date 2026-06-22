import {
  getQuestion,
  updateQuestion,
  deleteQuestion,
} from "@/lib/data/questions";
import { updateQuestionSchema } from "@/lib/validation/schemas";
import { handle, json, parseBody } from "@/lib/data/respond";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    return json(await getQuestion(id));
  });
}

export async function PATCH(req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    const patch = await parseBody(req, updateQuestionSchema);
    return json(await updateQuestion(id, patch));
  });
}

export async function DELETE(_req: Request, { params }: Params) {
  return handle(async () => {
    const { id } = await params;
    return json(await deleteQuestion(id));
  });
}
