import { z } from "zod";
import { renderMarkdown } from "@/lib/markdown/render";
import { handle, json, parseBody } from "@/lib/data/respond";

const schema = z.object({
  // Render one or many markdown sources in a single round-trip (used by the
  // paste preview and study panel).
  sources: z.array(z.string()).max(500),
});

export async function POST(req: Request) {
  return handle(async () => {
    const { sources } = await parseBody(req, schema);
    const html = await Promise.all(sources.map((s) => renderMarkdown(s)));
    return json({ html });
  });
}
