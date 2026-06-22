import type { NextRequest } from "next/server";
import { listQuestions, createQuestion } from "@/lib/data/questions";
import { createQuestionSchema } from "@/lib/validation/schemas";
import { handle, json, parseBody } from "@/lib/data/respond";
import type { QuestionListFilters } from "@/types";

export async function GET(req: NextRequest) {
  return handle(async () => {
    const sp = req.nextUrl.searchParams;
    const filters: QuestionListFilters = {
      folderId: sp.get("folderId") ?? undefined,
      subtree: sp.get("subtree") === "true",
      status:
        (sp.get("status") as QuestionListFilters["status"]) ?? undefined,
      favorite: sp.has("favorite")
        ? sp.get("favorite") === "true"
        : undefined,
      tags: sp.get("tags")
        ? sp.get("tags")!.split(",").map((t) => t.trim()).filter(Boolean)
        : undefined,
      q: sp.get("q") ?? undefined,
      dateFrom: sp.get("dateFrom") ?? undefined,
      dateTo: sp.get("dateTo") ?? undefined,
      cursor: sp.get("cursor") ?? undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    };
    return json(await listQuestions(filters));
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const input = await parseBody(req, createQuestionSchema);
    return json(await createQuestion(input), 201);
  });
}
