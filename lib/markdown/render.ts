import "server-only";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";

type Processor = ReturnType<typeof buildProcessor>;

/**
 * Cache the unified processor on globalThis. Building it (and the shiki
 * highlighter inside rehype-pretty-code) is expensive, and Next HMR would
 * otherwise rebuild it on every change.
 */
declare global {
  var _mdProcessor: Processor | undefined;
}

// Sanitization schema extended to keep the attributes rehype-pretty-code emits
// for syntax highlighting (inline styles + data-* on code/pre/span/figure),
// and to allow Quill's <u> underline tag which is missing from defaultSchema.
// Also allows class/style on common block elements so Quill-stored HTML
// (e.g. <li class="ql-indent-1">) renders correctly when stored as raw HTML.
const schema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "u", "s"],
  attributes: {
    ...defaultSchema.attributes,
    // Quill block elements need className to preserve indentation / list styles
    li: [...(defaultSchema.attributes?.li ?? []), "className", "style", ["dataIndent", /.*/]],
    ol: [...(defaultSchema.attributes?.ol ?? []), "className", "style"],
    ul: [...(defaultSchema.attributes?.ul ?? []), "className", "style"],
    p:  [...(defaultSchema.attributes?.p  ?? []), "className", "style"],
    div: [...(defaultSchema.attributes?.div ?? []), "className", "style"],
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      "className",
      "style",
      ["dataLanguage", /.*/],
      ["dataTheme", /.*/],
    ],
    pre: [
      ...(defaultSchema.attributes?.pre ?? []),
      "className",
      "style",
      ["dataLanguage", /.*/],
      ["dataTheme", /.*/],
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      "className",
      "style",
      ["dataLine", /.*/],
    ],
    figure: [
      ...(defaultSchema.attributes?.figure ?? []),
      ["dataRehypePrettyCodeFigure", /.*/],
    ],
  },
};

function buildProcessor() {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    // Parse raw-HTML nodes (from HTML stored in DB) into real hast nodes
    // before sanitise runs. Safe because rehype-sanitize follows immediately.
    .use(rehypeRaw)
    .use(rehypePrettyCode, {
      // Dual themes: light token colors render by default; .dark overrides
      // via the CSS in globals.css using --shiki-dark variables.
      theme: { light: "github-light", dark: "github-dark" },
      keepBackground: false,
    })
    .use(rehypeSanitize, schema)
    .use(rehypeStringify);
}

function getProcessor(): Processor {
  if (!globalThis._mdProcessor) {
    globalThis._mdProcessor = buildProcessor();
  }
  return globalThis._mdProcessor;
}

/** Render raw markdown to sanitized, syntax-highlighted HTML (server only). */
export async function renderMarkdown(markdown: string): Promise<string> {
  if (!markdown?.trim()) return "";
  const cleanMarkdown = markdown.replace(/\u00A0/g, ' ');
  const file = await getProcessor().process(cleanMarkdown);
  return String(file);
}
