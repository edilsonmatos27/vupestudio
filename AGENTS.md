<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Architecture rules

- Server functions live in `src/functions/*.functions.ts` (never `src/server/`, which the client import guard blocks); load `@/lib/*.server.ts` modules with `await import()` inside handlers so server code never enters the browser bundle.
- Access decisions (trial, paid period, block) come only from the SQL function `public.access_state` using the DB clock; UI timers are informative.
- Credits are buckets + reservations + ledger in SQL functions (`reserve_operation_credits`, `consume_reservation`, `release_reservation`, `grant_credits`, `apply_invoice_credits`, `admin_adjust_credits`) callable only by service_role; never update balances from app code.
- Paid entitlement (plan_id, paid_through, credits) changes only from a Stripe invoice re-fetched server-side and marked `paid`; subscription sync alone never grants access.
- Stripe uses the admin's own keys stored AES-GCM-encrypted in `stripe_credentials` (key from `VUPE_SECRETS_KEY`), REST calls pinned to API version 2024-06-20; test and live data are separated by a `mode` column.
- Image AI runs only server-side through the Lovable AI Gateway; the verified model catalog and capabilities live in `src/lib/models.ts` (shared, no secrets).
- Agent base prompts live only in `agent_versions` (service_role only) and are referenced by `operations.agent_version_id`; never return them to subscriber flows.
- Vectorization traces in the browser with imagetracerjs (public domain); the server authorizes the operation and stores only SVGs rebuilt by `src/lib/svg-sanitize.ts`.
- Public media (logo, favicon, agent images) is served from the private `vupe-media` bucket via `/api/public/media/$name` because public buckets are blocked in this workspace.
- Business-rule SQL checks live in `supabase/tests/business_rules.sql` (self-rolling-back); unit tests run with `bunx vitest run`.
