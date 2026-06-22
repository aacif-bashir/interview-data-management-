import { findDuplicates } from "@/lib/data/questions";
import { checkDuplicatesSchema } from "@/lib/validation/schemas";
import { handle, json, parseBody } from "@/lib/data/respond";

export async function POST(req: Request) {
  return handle(async () => {
    const { questions, folderId } = await parseBody(
      req,
      checkDuplicatesSchema
    );
    const duplicates = await findDuplicates(questions, folderId);
    return json({ duplicates });
  });
}
