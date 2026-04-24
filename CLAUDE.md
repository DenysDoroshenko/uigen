# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run setup        # First-time setup: install deps + Prisma generate + migrate DB
npm run dev          # Dev server with Turbopack
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest unit tests
npm run db:reset     # Reset SQLite database
```

Run a single test file:
```bash
npx vitest run src/path/to/file.test.ts
```

Requires `ANTHROPIC_API_KEY` in `.env`. Without it, the app falls back to `MockLanguageModel` in `src/lib/provider.ts` that returns static demo components.

## Architecture

UIGen is a Next.js 15 (App Router) application that lets users describe React components in a chat interface and see them rendered live. Claude processes requests using two AI tools — a string-replace editor and a file manager — to manipulate an in-memory virtual file system. Generated code is compiled in the browser and rendered in a preview iframe.

### Core Data Flow

1. User sends a message in `ChatInterface` → POST `/api/chat/route.ts`
2. The API calls `streamText()` (Vercel AI SDK) with the system prompt and two tools:
   - `str_replace_editor` (`src/lib/tools/str-replace.ts`) — create/edit files via string replacement
   - `file_manager` (`src/lib/tools/file-manager.ts`) — rename and delete files
3. Tool calls mutate a `VirtualFileSystem` instance (in-memory Map tree, `src/lib/file-system.ts`); no disk writes ever occur
4. Streamed tool results update React state via `useAIChat` hook in `src/lib/contexts/chat-context.tsx`
5. `PreviewFrame` picks up the updated VFS, compiles JSX via `src/lib/transform/jsx-transformer.ts`, and renders the component
6. On stream completion, the full messages + file state are saved to Prisma (SQLite) if the user is authenticated

### Key Files

| File | Role |
|---|---|
| `src/app/api/chat/route.ts` | Core AI endpoint — assembles tools, runs `streamText`, persists to DB |
| `src/lib/file-system.ts` | `VirtualFileSystem` class — all in-memory file operations |
| `src/lib/prompts/generation.tsx` | System prompt sent to Claude — defines component generation rules |
| `src/lib/provider.ts` | Selects real Anthropic model or mock fallback |
| `src/lib/contexts/chat-context.tsx` | `useAIChat` hook — manages streaming state and VFS updates |
| `src/lib/transform/jsx-transformer.ts` | Compiles generated JSX for browser preview |
| `src/middleware.ts` | JWT auth middleware — protects `/api` routes |
| `prisma/schema.prisma` | Two models: `User` and `Project` (messages + file data stored as JSON) |

### State Management

- **File system state** lives in `src/lib/contexts/file-system-context.tsx` and is passed to the chat API as serialized JSON on each request
- **Chat state** (messages, streaming status, active file) is managed by `useAIChat` in `chat-context.tsx`
- **Auth state** uses JWT cookies; server actions in `src/actions/` fetch user-scoped data

### Component Generation Rules (from system prompt)

- Root entrypoint is always `/App.jsx`
- All imports use the `@/` alias (e.g. `@/components/Button`)
- Tailwind CSS for all styling — no inline styles or CSS modules
- Claude iterates up to 40 tool-call steps per request

## Database

The database schema is defined in `prisma/schema.prisma`. Reference it to understand the structure of data stored in the database.

## Code Style

- Use comments sparingly. Only comment complex code where the logic is non-obvious.

### Tech Stack

- **Frontend:** React 19, Next.js 15 App Router, TypeScript, Tailwind CSS v4
- **AI:** Anthropic Claude via `@ai-sdk/anthropic` + Vercel AI SDK (`streamText`)
- **DB:** Prisma ORM + SQLite
- **Editor:** Monaco Editor
- **Auth:** Custom JWT + bcrypt (no third-party auth provider)
- **Testing:** Vitest + Testing Library (jsdom environment)
- **Path alias:** `@/*` → `src/*`
