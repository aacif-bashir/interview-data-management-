"use client";

import { useCallback, useRef, useId, useMemo } from "react";
import dynamic from "next/dynamic";
import { SquareCode, Code } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import "react-quill-new/dist/quill.snow.css";

// Dynamically import ReactQuill to avoid SSR issues.
// Cast to any so we can attach ref without TS fighting the dynamic wrapper type.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false }) as any;

interface QuillEditorProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
}

/**
 * Rich-text editor built on React Quill (snow theme).
 * Exposes a code-block formatter row (language input + SquareCode / inline-code
 * / bold buttons) that inserts fenced ``` blocks into the editor content,
 * preserving the same toolbar behaviour as the previous MarkdownTextarea.
 */
export function QuillEditor({
  value,
  onChange,
  placeholder,
  className,
  editorClassName = "min-h-[35vh] max-h-[40vh]",
}: QuillEditorProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quillRef = useRef<any>(null);
  const toolbarId = `quill-toolbar-${useId().replace(/:/g, "")}`;

  /** Helper: get the underlying Quill instance. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getQuill = (): any | null => quillRef.current?.getEditor?.() ?? null;

  /**
   * Insert a fenced code block at the current cursor position.
   * Inserts raw fence markers as plain text — preprocessQuillHtml() in
   * quillToMarkdown.ts detects the ```lang … ``` paragraph pattern and
   * converts it to a proper <pre class="ql-syntax"> before Turndown runs,
   * so remark-parse receives a well-formed fenced block with the language tag.
   */
  const insertCodeBlock = useCallback(() => {
    const quill = getQuill();
    if (!quill) return;
    const range = quill.getSelection(true);
    const index: number = range ? range.index : quill.getLength();
    const selected: string =
      range && range.length > 0 ? quill.getText(range.index, range.length) : "// code here";

    const fence = "```";
    // Build: \n```\ncode\n```\n
    const block = `\n${fence}\n${selected}\n${fence}\n`;

    if (range && range.length > 0) quill.deleteText(range.index, range.length);
    quill.insertText(index, block, "user");

    // Place cursor on the code content line
    const contentStart = index + 1 + fence.length + 1; // after \n```\n
    quill.setSelection(contentStart, selected.length);
  }, []);

  /** Insert inline code backticks around selection. */
  const insertInlineCode = useCallback(() => {
    const quill = getQuill();
    if (!quill) return;
    const range = quill.getSelection(true);
    const index: number = range ? range.index : quill.getLength();
    const selected: string =
      range && range.length > 0 ? quill.getText(range.index, range.length) : "code";
    if (range && range.length > 0) quill.deleteText(range.index, range.length);
    quill.insertText(index, `\`${selected}\``, "user");
    quill.setSelection(index + 1, selected.length);
  }, []);

  // Quill toolbar modules (using a custom container for integrated tools).
  const modules = useMemo(
    () => ({
      toolbar: {
        container: `#${toolbarId}`,
      },
    }),
    [toolbarId]
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* ── Quill editor ── */}
      <div
        className={cn(
          "quill-wrapper overflow-hidden rounded-md border bg-background flex flex-col",
          editorClassName,
        )}
      >
        {/* Custom Toolbar */}
        <div id={toolbarId} className="border-b border-border bg-muted/20">
          <span className="ql-formats">
            <select className="ql-header" defaultValue="">
              <option value="1"></option>
              <option value="2"></option>
              <option value="3"></option>
              <option value=""></option>
            </select>
          </span>
          <span className="ql-formats">
            <button className="ql-bold" aria-label="Bold"></button>
            <button className="ql-italic" aria-label="Italic"></button>
            <button className="ql-underline" aria-label="Underline"></button>
            <button className="ql-strike" aria-label="Strike"></button>
          </span>
          <span className="ql-formats">
            <button className="ql-list" value="ordered" aria-label="Ordered List"></button>
            <button className="ql-list" value="bullet" aria-label="Bullet List"></button>
          </span>
          <span className="ql-formats">
            <button className="ql-blockquote" aria-label="Blockquote"></button>
          </span>
          <span className="ql-formats">
            <button className="ql-clean" aria-label="Clear formatting"></button>
          </span>
          <span className="ql-formats inline-flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 hover:bg-muted"
                    onClick={insertCodeBlock}
                    aria-label="Code block (```)"
                  >
                    <SquareCode className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Code block (```)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 hover:bg-muted"
                    onClick={insertInlineCode}
                    aria-label="Inline code (`)"
                  >
                    <Code className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Inline code (`)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </span>
        </div>

        <ReactQuill
          ref={quillRef}
          theme="snow"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          modules={modules}
          style={{ height: "100%", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
        />
      </div>
    </div>
  );
}
