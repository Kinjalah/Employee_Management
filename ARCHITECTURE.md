# Architecture (placeholder)

Overview:

- Frontend: React + TanStack React Start, routes in `src/routes`.
- Auth & DB: Supabase (Auth, Postgres). Migrations in `supabase/migrations`.
- Hosting: Cloudflare Workers via `wrangler` using `src/server.ts` entry.

Diagram: (replace with PNG/PDF before submission)

```
Browser -> Cloudflare Worker (Server SSR) -> Supabase (Auth + Postgres)
```

Notes:
- Use Supabase row-level security and service roles for secure actions.
- Store sensitive keys in Cloudflare secret store; use `VITE_` vars only for safe public keys.

Replace this placeholder with a visual diagram (PNG/PDF) for the final submission.