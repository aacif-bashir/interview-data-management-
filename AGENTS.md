<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project architecture

A single-user, markdown-based Q&A / flashcard study app. Next.js 16 (App Router) · React 19 · TypeScript · MongoDB (Mongoose) · Tailwind · shadcn-style UI (Radix). Scan this file first; only read framework docs when touching Next.js internals.

## Data flow (questions & answers are plain Markdown strings, end to end)
Question/answer text is stored, transmitted, split, and edited as **plain Markdown strings**. It's only turned into HTML at display time via the shared render pipeline. Anything editing Q/A text must keep the value a Markdown string.

`UI ⟶ lib/api-client.ts ⟶ app/api/**/route.ts ⟶ lib/data/* ⟶ models/* (Mongo)`
then for display: `Markdown string ⟶ /api/render ⟶ sanitized HTML ⟶ <MarkdownHtml>`.

## Layout
- `proxy.ts` — single-user auth gate. **Next 16 renamed `middleware` → `proxy`**, runs on the Node runtime. Every page/API route requires a valid session cookie; `/login` and `/api/auth/login` are the only public paths. See [[auth-setup]].
- `app/` — App Router. `app/page.tsx` is the workspace; `app/login/`; `app/api/**/route.ts` are the JSON API handlers.
- `lib/api-client.ts` — typed `fetch` wrappers: `foldersApi`, `questionsApi`, `renderApi`. Client components call these, never `fetch` directly.
- `lib/data/` — server-side data layer. `folders.ts` / `questions.ts` hold logic; `respond.ts` provides `handle()` / `parseBody()` / `json()` (routes wrap bodies in `handle()` and validate with zod); `errors.ts` `DataError(status)`; `serialize.ts` Mongo→DTO.
- `lib/validation/schemas.ts` — zod schemas (`bulkCreateSchema`, `createQuestionSchema`, …). Validate request bodies here.
- `lib/markdown/render.ts` — `renderMarkdown()`: unified · remark-gfm · remark-rehype · **rehype-pretty-code (shiki, dual github-light/dark themes)** · rehype-sanitize · stringify. Cached on `globalThis`. Reached from the client via `renderApi.many()` → `/api/render` (max 500 sources/call).
- `lib/paste/split.ts` — pure client-side splitting of pasted blocks into ordered items; `maskFences()` protects ` ``` ` code blocks from being treated as split delimiters. `lib/paste/zip.ts` pairs Q↔A.
- `models/` — Mongoose `Question` & `Folder`. `question`/`answer` are `String`.
- `components/` — `ui/` (shadcn primitives), `paste/`, `study/`, `folders/`, `questions/`, `markdown/`, `workspace/`.

## Key components
- `components/markdown/MarkdownHtml.tsx` — renders already-sanitized HTML via `dangerouslySetInnerHTML` with the `.md` class (styled in `app/globals.css`). The only correct way to show rendered Q/A.
- `components/paste/MarkdownTextarea.tsx` — Markdown editor used wherever Q/A text is authored. Plain `<Textarea>` (value stays a Markdown string) + a toolbar (fenced code block w/ language input defaulting to `ts`, inline code, bold) + a Write/Preview toggle (Preview renders via `renderApi`). Size via the `editorClassName` prop (default `min-h-[50vh] max-h-[50vh]`). Used by `paste/PasteMapDialog.tsx` and `study/EditQuestionDialog.tsx`.
- `components/paste/PasteMapDialog.tsx` — two-step paste→split→preview→bulk-save flow with live duplicate detection.
- `components/study/StudyPanel.tsx` + `AnswerReveal.tsx` — study view; renders Q/A HTML fetched from `renderApi`.

## Conventions
- React 19: `ref` is a regular prop — UI primitives that spread `...props` (e.g. `ui/textarea.tsx`) forward refs without `forwardRef`.
- Client components that fetch use `lib/api-client.ts`; toast via `sonner`.
- When unavoidably calling `setState` inside an effect, add `// eslint-disable-next-line react-hooks/set-state-in-effect -- <reason>` (the lint rule is enforced).
- Markdown text is authored through `MarkdownTextarea`, displayed through `MarkdownHtml` — don't hand-roll either.
