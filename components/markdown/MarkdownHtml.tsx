import { cn } from "@/lib/utils";

/**
 * Presentational renderer for already-sanitized markdown HTML. Safe to use in
 * client components (the HTML is produced by our server-side, sanitized
 * pipeline in lib/markdown/render.ts). The `.md` class drives styling in
 * globals.css.
 */
export function MarkdownHtml({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  if (!html) {
    return (
      <p className={cn("text-sm italic text-muted-foreground", className)}>
        (empty)
      </p>
    );
  }
  return (
    <div
      className={cn("md", className)}
      // Sanitized server-side via rehype-sanitize.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
