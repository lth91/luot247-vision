# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager: **bun** (lockfile is `bun.lock` / `bun.lockb`). `package-lock.json` exists for the GitHub release CI which uses `npm ci`. For local work, prefer `bun`.

- `bun install` — install dependencies
- `bun run dev` — Vite dev server on **port 8080** (host `::`)
- `bun run build` — production build
- `bun run build:dev` — development-mode build (keeps `lovable-tagger` injected)
- `bun run lint` — ESLint over `**/*.{ts,tsx}` (note: `@typescript-eslint/no-unused-vars` is disabled)
- `bun run preview` — preview built site

There is no test suite. There is no typecheck script — run `npx tsc --noEmit` manually if needed.

### Supabase

Supabase project ref: `gklpvaindbfkcmuuuffz`. Edge functions are deployed by GitHub Actions (`.github/workflows/deploy-functions.yml`) on every push to `main` that touches `supabase/functions/**` or `supabase/config.toml`. The workflow deploys **all** functions in `supabase/functions/` with `--no-verify-jwt`. Migrations are applied manually via the Supabase dashboard or `npx supabase db push` after `supabase link --project-ref gklpvaindbfkcmuuuffz`; CI does **not** apply migrations.

Local one-off function deploy: `npx supabase functions deploy <name> --project-ref gklpvaindbfkcmuuuffz`.

### Releases

`semantic-release` runs on push to `main` (`.github/workflows/release.yml`). It bumps `package.json`, regenerates `CHANGELOG.md`, tags, and creates a GitHub release. Commits must use Conventional Commits (`fix:`, `feat:`, `chore:`, scopes like `electricity`, `discovery`, `autonomy`). Release commits are skipped via `chore(release):` prefix to avoid loops.

## Architecture

This is a Vite + React + TypeScript SPA (originally scaffolded by Lovable; `lovable-tagger` is injected only in dev) backed by Supabase. The product is a Vietnamese news viewer (`luot247.com`) with two parallel surfaces:

1. **Main news feed** (`/`, `Index.tsx`) — manually curated/imported news with view-count tracking and a "read/unread" UX.
2. **Electricity-industry vertical** (`/d`, `ElectricityNews.tsx`) — fully automated crawl + LLM-summarize pipeline for ~30 Vietnamese electricity-sector sources.

### Routing & top-level wiring

`src/App.tsx` mounts `QueryClientProvider` → `TooltipProvider` → `ReadingProvider` → `FavoritesProvider` → `BrowserRouter`. Auth session is read once at the App level and `userId` is passed into `FavoritesProvider`; each page re-reads the session itself when it needs `userRole`.

Routes are mostly Vietnamese-slugged (`/duyet-tin`, `/tai-du-lieu`, `/quan-ly-view`, `/lich-su-reset`). Two electricity routes: `/d` (list) and `/ddashboard` (admin metrics). Always add new `<Route>` entries **above** the catch-all `*` route.

### Supabase client & types

`src/integrations/supabase/client.ts` and `src/integrations/supabase/types.ts` are **auto-generated** ("Do not edit it directly"). The publishable key is hardcoded; rotation requires regenerating both files (see migration `20260427090000_rotate_to_publishable_key.sql`). Tables newer than the generated types (e.g. `view_logs2`) are accessed with `(supabase as any).from("…")` casts — this is intentional, not a bug to fix.

### Roles

`user_roles` table has three values: `admin`, `moderator`, `user`. Pages read role with a single `.eq("user_id", session.user.id).maybeSingle()` against `user_roles` and gate UI on the result. There is no central role hook; this pattern is duplicated across pages.

### Key tables

Frontend talks directly to: `news`, `view_logs2`, `user_roles`, `favorites`, `profiles`, `classification_history`, `import_history`, `reset_history`, `electricity_news`, `electricity_sources`. The `2`-suffixed tables (`view_logs2`, `view_stats2`, etc.) are the current generation; older `view_logs`/`view_stats` exist but are deprecated — prefer the `2` variants for new work.

### View-counting system

Every visit to `/` inserts a row into `view_logs2`. Aggregation runs in Postgres via cron (`pg_cron`) — see migrations `20251104020000_schedule_daily_auto_views.sql` and `20251104011328_*.sql`. Edge function `daily-auto-views` runs every 30 min and only inserts views during 7:00–22:00 GMT+7 (peak-hour weighted) to simulate organic traffic to ~700/day. Service role key is read from Supabase Vault (`service_role_key` secret) — see `HUONG_DAN_SCHEDULE_DAILY_AUTO_VIEWS.md`.

### Electricity pipeline (the heaviest subsystem)

End-to-end flow per cycle (cron-driven in Postgres):

1. **`crawl-electricity-news`** (every 15 min → hourly) iterates `electricity_sources` (RSS or HTML list), respecting `tier`, `consecutive_failures`, `SOURCE_CONCURRENCY=3`, `MAX_ARTICLES_PER_SOURCE=6`, `SOURCES_PER_RUN=15`, `TIME_BUDGET_MS=120000`. Each article is canonicalised, SHA-256 hashed for dedup, content-extracted with `deno_dom`, then summarised in ≤150 words by `claude-haiku-4-5-20251001`. Stored in `electricity_news`.
2. **`discovery-rss-news`** scans general-news RSS feeds, runs `_shared/electricity-keywords.ts` keyword pre-filter, then LLM-classifies survivors with Haiku to find candidate articles outside the curated source list.
3. **`discover-candidates`** (autonomy Phase E) probes Google News for new *source domains*, not articles, feeding the source-quality score.
4. **`auto-fix-selector`** (Phase G) attempts to repair broken `article_content_selector` values when a source starts returning empty content.
5. **`weekly-autonomy-digest`** + **`health-check`** push Telegram events via `_shared/telegram.ts`.
6. **`cleanup-electricity-news`** + `source-cleanup` purge off-topic articles and disable zero-yield sources.

Topical filtering is layered: keyword pre-filter → LLM classifier → reject-rules → post-insert cleanup migrations. When an off-topic article slips through, the fix is usually a new reject-rule migration plus a one-shot DELETE migration — see the `20260426*` and `20260503*` series for examples.

`src/pages/ElectricityNews.tsx` (`/d`) reuses the same single-column "list of rows" layout as the home feed (see `2dd9aae`). `/ddashboard` is the admin view for source health, tier, and quality score.

### State / context

- `ReadingContext` — current news index, `readNewsIds` (persisted to `localStorage` key `luot247_read_news`), hide-read toggle, deep-link sync between scroll mode and flip mode, highlight pulse on shared links.
- `FavoritesContext` — favourites synced to the `favorites` table when `userId` is present, otherwise localStorage-only.

### UI

shadcn/ui components live in `src/components/ui/` (config in `components.json`). Theme via `next-themes`. Toasts: both `@/components/ui/toaster` and `sonner` are mounted — most new code uses `sonner` (`import { toast } from "sonner"`).

### Path alias

`@/` → `./src/` (configured in both `vite.config.ts` and `tsconfig.json`). Use it consistently.

## Conventions specific to this repo

- Migrations dated 2025xx are the original Lovable era; 2026xx are the autonomy/electricity era. New migrations use `YYYYMMDDhhmmss_descriptive_name.sql` (no UUID suffix) — see the post-April-2026 files.
- Commit messages are Vietnamese-language with English Conventional-Commit prefixes (e.g. `fix(electricity): fallback parse ngày từ header DD/MM/YYYY HH:MM cho EVN`). Match this style.
- The frontend ships hardcoded SQL helpers at the repo root (`apply_approval_system.sql`, `cleanup_iran_dashboard.sql`, etc.) — these are one-shot scripts pasted into the Supabase SQL editor, not part of the migration chain.
- LLM model for summaries/classification: `claude-haiku-4-5-20251001`. Don't silently bump it without a release note.
