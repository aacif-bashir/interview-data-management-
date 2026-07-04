/**
 * Converts the HTML string produced by React Quill into a Markdown string
 * that flows correctly through the existing render pipeline
 * (renderMarkdown → rehype-pretty-code → MarkdownHtml).
 *
 * Only runs client-side (Turndown is a browser/node library but we never
 * call this during SSR — it's only invoked in goToPreview).
 */
import TurndownService from "turndown";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeStringify from "rehype-stringify";

let _td: TurndownService | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mdProcessor: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMarkdownProcessor(): any {
  if (_mdProcessor) return _mdProcessor;
  _mdProcessor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify);
  return _mdProcessor;
}

function getTurndown(): TurndownService {
  if (_td) return _td;
  _td = new TurndownService({
    headingStyle: "atx",      // ## headings
    hr: "---",
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    fence: "```",
    emDelimiter: "_",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });

  // Quill wraps code blocks in <pre class="ql-syntax">…</pre>.
  // We map them to fenced blocks. The language comes from data-language which
  // preprocessQuillHtml() sets when it reconstructs fences from paragraphs.
  _td.addRule("quillCodeBlock", {
    filter: (node) =>
      node.nodeName === "PRE" &&
      (node as HTMLElement).classList.contains("ql-syntax"),
    replacement: (content, node) => {
      const el = node as HTMLElement;
      const lang = el.dataset?.language?.trim() ?? el.getAttribute?.("data-language")?.trim() ?? "";
      // content may still have stray \n from Turndown — trim to be safe
      return `\`\`\`${lang}\n${content.trim()}\n\`\`\``;
    },
  });

  // Quill wraps ordered list items in <li class="ql-indent-N"> inside <ol>.
  _td.addRule("quillOrderedList", {
    filter: (node) =>
      node.nodeName === "LI" &&
      node.parentElement?.nodeName === "OL",
    replacement: (content, node) => {
      const el = node as HTMLElement;
      const indent = parseInt(el.dataset.indent ?? "0", 10) || 0;
      const prefix = "   ".repeat(indent);
      return `${prefix}1. ${content.trim()}\n`;
    },
  });

  // Quill wraps unordered list items inside <ul>
  _td.addRule("quillBulletList", {
    filter: (node) =>
      node.nodeName === "LI" &&
      node.parentElement?.nodeName === "UL",
    replacement: (content, node) => {
      const el = node as HTMLElement;
      const indent = parseInt(el.dataset.indent ?? "0", 10) || 0;
      const prefix = "   ".repeat(indent);
      return `${prefix}- ${content.trim()}\n`;
    },
  });

  _td.addRule("quillUnderline", {
    filter: ["u"],
    replacement: (content) => `<u>${content}</u>`,
  });

  // Quill uses <s> for strikethrough — map to GFM ~~strike~~
  _td.addRule("quillStrikethrough", {
    filter: ["s"],
    replacement: (content) => `~~${content}~~`,
  });

  // Blockquote — Turndown already handles <blockquote> but Quill nests
  // paragraphs inside, so we trim whitespace carefully.
  _td.addRule("quillBlockquote", {
    filter: ["blockquote"],
    replacement: (content) =>
      content
        .trim()
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n") + "\n\n",
  });

  return _td;
}

/**
 * Preprocess Quill HTML before handing it to Turndown.
 *
 * Two problems this solves:
 *
 * 1. When users type fenced code blocks directly (``` ```ts … ``` ```) in the
 *    Quill editor, Quill stores each line as a separate <p> element.  Turndown
 *    emits a blank line between every <p>, which breaks the fence syntax for
 *    remark-parse (the opening fence and the content must be contiguous).
 *    We detect those paragraph sequences and fold them into a single
 *    <pre class="ql-syntax" data-language="lang"> block so the quillCodeBlock
 *    Turndown rule can emit a well-formed fenced markdown block.
 *
 * 2. Quill's native code-block format (used by insertCodeBlock via formatLine)
 *    creates <pre class="ql-syntax"> but WITHOUT a language attribute because
 *    Quill 1.x doesn't support language tags in its delta.  We read the
 *    data-language attribute that insertCodeBlock writes to the DOM BEFORE
 *    Quill's onChange fires — wait, that's lost.  Instead we rely solely on
 *    the paragraph-scanning below (which captures the ``` lang marker typed
 *    by the user or injected by insertCodeBlock as plain text).
 *
 * Only called client-side (uses DOMParser).
 */
function preprocessQuillHtml(html: string): string {
  if (typeof window === "undefined") return html; // SSR guard

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${html}</body>`, "text/html");
  const body = doc.body;
  const children = Array.from(body.childNodes);

  const result: Node[] = [];
  let i = 0;

  while (i < children.length) {
    const node = children[i];

    // Only inspect element nodes
    if (node.nodeType !== Node.ELEMENT_NODE) {
      result.push(node);
      i++;
      continue;
    }

    const el = node as Element;

    // ── Already a native Quill code block (<pre class="ql-syntax">) ──
    // Leave it as-is; the Turndown rule handles it.
    if (el.nodeName === "PRE" && el.classList.contains("ql-syntax")) {
      result.push(el);
      i++;
      continue;
    }

    // ── Paragraph whose text looks like an opening fence: ```lang ──
    const text = el.textContent ?? "";
    const fenceOpen = text.match(/^```(\w*)$/);

    if (el.nodeName === "P" && fenceOpen) {
      const lang = fenceOpen[1] ?? "";
      const codeLines: string[] = [];
      i++;

      // Collect subsequent <p> elements until we hit a closing ``` or EOF
      while (i < children.length) {
        const inner = children[i];
        if (inner.nodeType !== Node.ELEMENT_NODE) { i++; continue; }
        const innerEl = inner as Element;
        const innerText = innerEl.textContent ?? "";

        if (innerEl.nodeName === "P" && innerText.trim() === "```") {
          i++; // consume closing fence paragraph
          break;
        }

        // Quill sometimes injects a <br> for empty lines
        codeLines.push(innerText === "\n" || innerEl.innerHTML === "<br>" ? "" : innerText);
        i++;
      }

      // Build a proper <pre class="ql-syntax" data-language="lang"> node
      const pre = doc.createElement("pre");
      pre.className = "ql-syntax";
      if (lang) pre.dataset.language = lang;
      pre.textContent = codeLines.join("\n");
      result.push(pre);
      continue;
    }

    result.push(el);
    i++;
  }

  // Re-serialise
  const wrapper = doc.createElement("div");
  result.forEach((n) => wrapper.appendChild(n));
  return wrapper.innerHTML;
}

/**
 * Post-process the Turndown output to collapse any leftover blank lines that
 * ended up INSIDE a fenced code block.  remark-parse requires the opening
 * fence to be immediately followed by content (no intervening blank line).
 *
 * Handles:
 *   ```ts          ```ts
 *                →
 *   code           code
 *   ```            ```
 */
function collapseFenceBlankLines(md: string): string {
  // Remove blank lines immediately after an opening fence
  md = md.replace(/(^|\n)(```\w*)\n\n+/g, "$1$2\n");
  // Remove blank lines immediately before a closing fence
  md = md.replace(/\n\n+(```(\s|$))/g, "\n$1");
  return md;
}

/**
 * Quill's "empty" state emits `<p><br></p>`. Returns true when the HTML
 * represents a blank editor.
 */
export function isQuillEmpty(html: string): boolean {
  return !html || /^(<p>\s*(<br\s*\/?>)?\s*<\/p>\s*)+$/i.test(html.trim());
}

/**
 * Convert Quill HTML → Markdown string.
 * Returns an empty string for blank Quill output.
 */
export function quillHtmlToMarkdown(html: string): string {
  if (isQuillEmpty(html)) return "";
  const preprocessed = preprocessQuillHtml(html);
  const md = getTurndown().turndown(preprocessed).trim();
  return collapseFenceBlankLines(md);
}

/**
 * Converts a raw Markdown string (such as one loaded from MongoDB when editing
 * an existing question) into clean Quill HTML so React Quill renders lists,
 * formatting, and code blocks correctly instead of collapsing it into unstyled text.
 */
export function markdownToQuillHtml(markdown: string): string {
  if (!markdown?.trim()) return "";
  if (isQuillEmpty(markdown)) return "";

  // If it is already Quill HTML starting with tags like <p>, <pre>, <ol>, <ul>, etc., leave as is.
  if (/^\s*<(p|pre|ol|ul|h[1-6]|blockquote|div)/i.test(markdown)) {
    return markdown;
  }

  try {
    const html = getMarkdownProcessor().processSync(markdown).toString();

    if (typeof window === "undefined") {
      return html; // SSR guard
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${html}</body>`, "text/html");
    const body = doc.body;

    // 1. Transform <pre><code class="language-xxx"> into <pre class="ql-syntax" data-language="xxx">
    const preNodes = body.querySelectorAll("pre");
    preNodes.forEach((pre) => {
      const code = pre.querySelector("code");
      if (code) {
        const match = code.className.match(/language-(\w+)/);
        const lang = match ? match[1] : "";
        pre.className = "ql-syntax";
        if (lang) pre.setAttribute("data-language", lang);
        pre.textContent = code.textContent;
      } else if (!pre.classList.contains("ql-syntax")) {
        pre.className = "ql-syntax";
      }
    });

    // 2. Transform single newlines inside <p> into separate <p> elements
    // so line breaks in user markdown aren't collapsed into spaces by Quill
    const pNodes = body.querySelectorAll("p");
    pNodes.forEach((p) => {
      const text = p.innerHTML;
      if (text.includes("\n")) {
        const lines = text.split("\n").filter((l) => l.trim() !== "");
        if (lines.length > 1) {
          const frag = doc.createDocumentFragment();
          lines.forEach((line) => {
            const newP = doc.createElement("p");
            newP.innerHTML = line;
            frag.appendChild(newP);
          });
          p.parentNode?.replaceChild(frag, p);
        }
      }
    });

    return body.innerHTML;
  } catch (e) {
    console.error("Failed to convert markdown to Quill HTML:", e);
    return markdown
      .split("\n\n")
      .map((block) => `<p>${block}</p>`)
      .join("");
  }
}

