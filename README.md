# Coding Interview Knowledge Base

A file-explorer–style knowledge management system for organizing and studying
coding-interview questions and answers. Built with Next.js 16 (App Router),
TypeScript, Tailwind CSS v4, shadcn/ui, MongoDB and Mongoose.

## Features

- **Folders & subfolders** — file-explorer sidebar with create / rename / move /
  delete (cascade), powered by a materialized-path tree for fast subtree queries.
- **Paste & Map** — paste a block of questions and a block of answers
  *separately*; they're auto-paired Q1→A1, Q2→A2…, with a preview table,
  mismatch detection, and manual reconciliation (merge / split / insert /
  delete rows) before saving.
- **Study mode** — answers are hidden by default; reveal with a button or
  `Space`; navigate questions with `←`/`→` (or `j`/`k`).
- **Markdown everywhere** — questions and answers are stored as Markdown and
  rendered with GitHub-Flavored Markdown + server-side syntax highlighting
  (Shiki, with light/dark themes).
- **Organize & find** — tags, statuses (Not Studied / Learning / Mastered),
  favorites, global text search, and filtering by status / favorite / date.
- **Scales to 10k+ questions** — cursor-based pagination over indexed,
  folder-ordered queries; lightweight list payloads.
- **Dark mode** toggle.

## Prerequisites

- Node.js 20.9+ (Next 16 requirement)
- A MongoDB database — a free [MongoDB Atlas](https://www.mongodb.com/atlas)
  cluster works well.

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure the database**

   Copy the example env file and set your connection string:

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` and set `MONGODB_URI` to your Atlas SRV string (or a local
   `mongodb://localhost:27017/interview-kb`). The database and collections are
   created automatically; indexes are declared on the Mongoose models and built
   on first use.

3. **Run the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Usage

1. Create a folder in the left sidebar (e.g. `Frontend`), then right-click it to
   add a subfolder (e.g. `React`).
2. Click **Paste & Map**, paste your questions in one box and answers in the
   other, pick (or auto-detect) the splitting strategy, review the preview, pick
   the destination folder, and save.
3. Select a folder to see its questions in the middle panel; click a question to
   study it on the right. Use `Space` to reveal the answer and `←`/`→` to move
   between questions.

## Architecture

- `app/api/**` — thin Next.js Route Handlers (parse → validate with Zod →
  delegate → respond).
- `lib/data/**` — the data-access layer (pure async functions over Mongoose
  models); never imports request/response objects.
- `models/**` — Mongoose schemas + indexes.
- `lib/db.ts` — HMR/serverless-safe Mongoose connection singleton.
- `lib/paste/**` — the pure Q/A splitting + zipping logic.
- `lib/markdown/render.ts` — server-only unified pipeline (remark/rehype + Shiki).
- `components/**` — the workspace shell, folder tree, question list, study panel,
  and the paste-and-map dialog.

## Scripts

| Command         | Description                     |
| --------------- | ------------------------------- |
| `npm run dev`   | Start the dev server (Turbopack)|
| `npm run build` | Production build                |
| `npm run start` | Run the production build        |
| `npm run lint`  | Lint with ESLint                |
