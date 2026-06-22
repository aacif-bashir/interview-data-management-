import { renderMarkdown } from "@/lib/markdown/render";
import { MarkdownHtml } from "./MarkdownHtml";

/**
 * Server component: renders raw markdown to highlighted HTML on the server.
 * For client components, render on the server and pass the html to
 * <MarkdownHtml /> instead.
 */
export async function Markdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const html = await renderMarkdown(source);
  return <MarkdownHtml html={html} className={className} />;
}
