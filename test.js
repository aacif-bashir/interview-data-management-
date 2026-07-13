"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isQuillEmpty = isQuillEmpty;
exports.quillHtmlToMarkdown = quillHtmlToMarkdown;
exports.markdownToQuillHtml = markdownToQuillHtml;
/**
 * Converts the HTML string produced by React Quill into a Markdown string
 * that flows correctly through the existing render pipeline
 * (renderMarkdown → rehype-pretty-code → MarkdownHtml).
 *
 * Only runs client-side (Turndown is a browser/node library but we never
 * call this during SSR — it's only invoked in goToPreview).
 */
var turndown_1 = require("turndown");
// @ts-expect-error - no types available
var turndown_plugin_gfm_1 = require("turndown-plugin-gfm");
var unified_1 = require("unified");
var remark_parse_1 = require("remark-parse");
var remark_gfm_1 = require("remark-gfm");
var remark_rehype_1 = require("remark-rehype");
var rehype_raw_1 = require("rehype-raw");
var rehype_stringify_1 = require("rehype-stringify");
var _td = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
var _mdProcessor = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getMarkdownProcessor() {
    if (_mdProcessor)
        return _mdProcessor;
    _mdProcessor = (0, unified_1.unified)()
        .use(remark_parse_1.default)
        .use(remark_gfm_1.default)
        .use(remark_rehype_1.default, { allowDangerousHtml: true })
        .use(rehype_raw_1.default)
        .use(rehype_stringify_1.default);
    return _mdProcessor;
}
function getTurndown() {
    if (_td)
        return _td;
    _td = new turndown_1.default({
        headingStyle: "atx", // ## headings
        hr: "---",
        bulletListMarker: "-",
        codeBlockStyle: "fenced",
        fence: "```",
        emDelimiter: "_",
        strongDelimiter: "**",
        linkStyle: "inlined",
    });
    _td.use(turndown_plugin_gfm_1.tables);
    // Quill wraps code blocks in <pre class="ql-syntax">…</pre>.
    // We map them to fenced blocks. The language comes from data-language which
    // preprocessQuillHtml() sets when it reconstructs fences from paragraphs.
    _td.addRule("quillCodeBlock", {
        filter: function (node) {
            return node.nodeName === "PRE" ||
                (node.classList && node.classList.contains("ql-syntax"));
        },
        replacement: function (_content, node) {
            var _a, _b, _c, _d, _e, _f;
            var el = node;
            var lang = ((_b = (_a = el.dataset) === null || _a === void 0 ? void 0 : _a.language) === null || _b === void 0 ? void 0 : _b.trim()) || ((_d = (_c = el.getAttribute) === null || _c === void 0 ? void 0 : _c.call(el, "data-language")) === null || _d === void 0 ? void 0 : _d.trim());
            if (!lang) {
                var codeChild = (_e = el.querySelector) === null || _e === void 0 ? void 0 : _e.call(el, "code");
                if (codeChild) {
                    var match = codeChild.className.match(/language-(\w+)/);
                    if (match)
                        lang = match[1];
                }
            }
            lang = lang || "ts";
            var code = (_f = el.textContent) !== null && _f !== void 0 ? _f : "";
            return "\n\n```".concat(lang, "\n").concat(code.replace(/\s+$/, ""), "\n```\n\n");
        },
    });
    // Quill wraps ordered list items in <li class="ql-indent-N"> inside <ol>.
    _td.addRule("quillOrderedList", {
        filter: function (node) {
            var _a;
            return node.nodeName === "LI" &&
                ((_a = node.parentElement) === null || _a === void 0 ? void 0 : _a.nodeName) === "OL";
        },
        replacement: function (content, node) {
            var _a;
            var el = node;
            var indent = parseInt((_a = el.dataset.indent) !== null && _a !== void 0 ? _a : "0", 10) || 0;
            var prefix = "   ".repeat(indent);
            return "".concat(prefix, "1. ").concat(content.trim(), "\n");
        },
    });
    // Quill wraps unordered list items inside <ul>
    _td.addRule("quillBulletList", {
        filter: function (node) {
            var _a;
            return node.nodeName === "LI" &&
                ((_a = node.parentElement) === null || _a === void 0 ? void 0 : _a.nodeName) === "UL";
        },
        replacement: function (content, node) {
            var _a;
            var el = node;
            var indent = parseInt((_a = el.dataset.indent) !== null && _a !== void 0 ? _a : "0", 10) || 0;
            var prefix = "   ".repeat(indent);
            return "".concat(prefix, "- ").concat(content.trim(), "\n");
        },
    });
    _td.addRule("quillUnderline", {
        filter: ["u"],
        replacement: function (content) { return "<u>".concat(content, "</u>"); },
    });
    // Quill uses <s> for strikethrough — map to GFM ~~strike~~
    _td.addRule("quillStrikethrough", {
        filter: ["s"],
        replacement: function (content) { return "~~".concat(content, "~~"); },
    });
    // Blockquote — Turndown already handles <blockquote> but Quill nests
    // paragraphs inside, so we trim whitespace carefully.
    _td.addRule("quillBlockquote", {
        filter: ["blockquote"],
        replacement: function (content) {
            return content
                .trim()
                .split("\n")
                .map(function (line) { return "> ".concat(line); })
                .join("\n") + "\n\n";
        },
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
function preprocessQuillHtml(html) {
    var _a, _b;
    if (typeof window === "undefined")
        return html; // SSR guard
    var parser = new DOMParser();
    var doc = parser.parseFromString("<body>".concat(html, "</body>"), "text/html");
    var body = doc.body;
    var children = Array.from(body.childNodes);
    var result = [];
    var i = 0;
    while (i < children.length) {
        var node = children[i];
        // Only inspect element nodes
        if (node.nodeType !== Node.ELEMENT_NODE) {
            result.push(node);
            i++;
            continue;
        }
        var el = node;
        // ── Already a native Quill code block (<pre class="ql-syntax">) ──
        // Leave it as-is; the Turndown rule handles it.
        if (el.nodeName === "PRE" && el.classList.contains("ql-syntax")) {
            result.push(el);
            i++;
            continue;
        }
        // ── Paragraph whose text looks like an opening fence: ```lang ──
        var text = (_a = el.textContent) !== null && _a !== void 0 ? _a : "";
        var fenceOpen = text.trim().match(/^```([a-zA-Z0-9_-]*)$/);
        if (el.nodeName === "P" && fenceOpen) {
            var lang = fenceOpen[1] || "ts";
            var codeLines = [];
            i++;
            // Collect subsequent <p> elements until we hit a closing ``` or EOF
            while (i < children.length) {
                var inner = children[i];
                if (inner.nodeType !== Node.ELEMENT_NODE) {
                    i++;
                    continue;
                }
                var innerEl = inner;
                var innerText = (_b = innerEl.textContent) !== null && _b !== void 0 ? _b : "";
                if (innerEl.nodeName === "P" && innerText.trim() === "```") {
                    i++; // consume closing fence paragraph
                    break;
                }
                // Quill sometimes injects a <br> for empty lines
                codeLines.push(innerText === "\n" || innerEl.innerHTML === "<br>" ? "" : innerText);
                i++;
            }
            // Build a proper <pre class="ql-syntax" data-language="lang"> node
            var pre = doc.createElement("pre");
            pre.className = "ql-syntax";
            pre.dataset.language = lang;
            pre.textContent = codeLines.join("\n");
            result.push(pre);
            continue;
        }
        result.push(el);
        i++;
    }
    // Re-serialise
    var wrapper = doc.createElement("div");
    result.forEach(function (n) { return wrapper.appendChild(n); });
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
function collapseFenceBlankLines(md) {
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
function isQuillEmpty(html) {
    return !html || /^(<p>\s*(<br\s*\/?>)?\s*<\/p>\s*)+$/i.test(html.trim());
}
/**
 * Convert Quill HTML → Markdown string.
 * Returns an empty string for blank Quill output.
 */
function quillHtmlToMarkdown(html) {
    if (isQuillEmpty(html))
        return "";
    // Replace non-breaking spaces with regular spaces to prevent line breaking issues
    var htmlWithNormalSpaces = html.replace(/\u00A0/g, ' ');
    var preprocessed = preprocessQuillHtml(htmlWithNormalSpaces);
    var md = getTurndown().turndown(preprocessed).trim();
    return collapseFenceBlankLines(md);
}
/**
 * Converts a raw Markdown string (such as one loaded from MongoDB when editing
 * an existing question) into clean Quill HTML so React Quill renders lists,
 * formatting, and code blocks correctly instead of collapsing it into unstyled text.
 */
function markdownToQuillHtml(markdown) {
    if (!(markdown === null || markdown === void 0 ? void 0 : markdown.trim()))
        return "";
    if (isQuillEmpty(markdown))
        return "";
    // If it is already Quill HTML starting with tags like <p>, <pre>, <ol>, <ul>, etc., leave as is.
    if (/^\s*<(p|pre|ol|ul|h[1-6]|blockquote|div)/i.test(markdown)) {
        return markdown;
    }
    try {
        var html = getMarkdownProcessor().processSync(markdown).toString();
        if (typeof window === "undefined") {
            return html; // SSR guard
        }
        var parser = new DOMParser();
        var doc_1 = parser.parseFromString("<body>".concat(html, "</body>"), "text/html");
        var body = doc_1.body;
        // 1. Transform <pre><code class="language-xxx"> into <pre class="ql-syntax" data-language="xxx">
        var preNodes = body.querySelectorAll("pre");
        preNodes.forEach(function (pre) {
            var code = pre.querySelector("code");
            if (code) {
                var match = code.className.match(/language-(\w+)/);
                var lang = match ? match[1] : "";
                pre.className = "ql-syntax";
                if (lang)
                    pre.setAttribute("data-language", lang);
                pre.textContent = code.textContent;
            }
            else if (!pre.classList.contains("ql-syntax")) {
                pre.className = "ql-syntax";
            }
        });
        // 2. Transform single newlines inside <p> into separate <p> elements
        // so line breaks in user markdown aren't collapsed into spaces by Quill
        var pNodes = body.querySelectorAll("p");
        pNodes.forEach(function (p) {
            var _a;
            var text = p.innerHTML;
            if (text.includes("\n")) {
                var lines = text.split("\n").filter(function (l) { return l.trim() !== ""; });
                if (lines.length > 1) {
                    var frag_1 = doc_1.createDocumentFragment();
                    lines.forEach(function (line) {
                        var newP = doc_1.createElement("p");
                        newP.innerHTML = line;
                        frag_1.appendChild(newP);
                    });
                    (_a = p.parentNode) === null || _a === void 0 ? void 0 : _a.replaceChild(frag_1, p);
                }
            }
        });
        return body.innerHTML;
    }
    catch (e) {
        console.error("Failed to convert markdown to Quill HTML:", e);
        return markdown
            .split("\n\n")
            .map(function (block) { return "<p>".concat(block, "</p>"); })
            .join("");
    }
}
