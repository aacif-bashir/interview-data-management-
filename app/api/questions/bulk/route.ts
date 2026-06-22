import { bulkCreateQuestions } from "@/lib/data/questions";
import { bulkCreateSchema } from "@/lib/validation/schemas";
import { handle, json, parseBody } from "@/lib/data/respond";

export async function POST(req: Request) {
  return handle(async () => {
    const input = await parseBody(req, bulkCreateSchema);
    return json(await bulkCreateQuestions(input), 201);
  });
}
