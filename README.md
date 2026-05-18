# In-House Goal Setting & Tracking Portal

Lightweight web portal for creating, approving, and tracking employee goals. Built with TanStack React Start, Vite, Supabase and deployable to Cloudflare Workers.

Quick start

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and fill Supabase values.

3. Run locally:

```bash
npm run dev
```

Build & deploy

```bash
npm run build
# then publish with wrangler (Cloudflare account + config)
wrangler publish
```

Important files

- `src/` — application source and routes (index, login, my-goals, team, admin)
- `src/integrations/supabase` — Supabase client and auth middleware
- `supabase/migrations` — database migrations used for schema
- `wrangler.jsonc` — Cloudflare Workers entry (`src/server.ts`)

Next steps performed

- Added `.env.example` and updated `.gitignore` to avoid committing secrets.
- Added this `README.md` and an `ARCHITECTURE.md` placeholder.

Recommended next work

- Implement Phase 1 goal creation + validation + manager approval flows.
- Add CSV export, audit trail, and check-in windows enforcement.
- Create demo users and populate Supabase with sample data using migrations.

Seeding demo data

There is a seed SQL placeholder at `supabase/migrations/20260518180000_seed_demo_data.sql` that inserts sample goal sheets, goals and check-ins for existing `profiles`. To use it:

1. Create demo users in Supabase Auth (or use existing users) and note their `id` (UUID).
2. Edit the seed SQL replacing the placeholder UUIDs with real profile IDs.
3. Run migrations via `supabase db push` or the Supabase dashboard to execute the seed.

Automated seed

There is an automated seed file `supabase/migrations/20260518200000_seed_demo_auto.sql` which will create a submitted sheet with three sample goals and a Q1 check-in for up to three existing `profiles`. Run it after you have at least one or more users in the `profiles` table.

Example (Supabase CLI):

```bash
supabase db push
```

This will apply migrations including the report RPCs and the demo seed.

If you want, I can now implement Phase 1 features (goal creation, validation, approval) and wire the DB migrations. Tell me to proceed and I'll start coding and creating/adjusting schema as needed.

Database migrations & enforcement (what I added)

- New migrations were added to `supabase/migrations` to enforce critical business rules at the DB level:
	- `20260518230000_enforce_goal_limits.sql` — enforces per-goal minimum weightage (10%), maximum 8 goals per sheet, and total weightage == 100 for a sheet. Adds a trigger on `goals`.
	- `20260518231000_enforce_checkin_window.sql` — enforces quarterly check-in windows (strict month-based enforcement) on `check_ins`.
	- `20260518232000_test_enforcements.sql` — developer guidance to test the triggers locally.

Do I need to create a database?

Yes — the application requires a Postgres database. The simplest approach is to create a free Supabase project and connect the app using the `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in your `.env`. After that:

1. Apply migrations using the Supabase CLI (recommended):

```bash
supabase db push
```

2. Or run each SQL file in `supabase/migrations` against your Postgres instance in order.

3. To run the enforcement tests, run the SQL in `20260518232000_test_enforcements.sql` manually (edit the placeholders first).

Notes:
- The DB migrations added here will cause exceptions when rules are violated — this is intentional so client bypass is prevented.
- Creating Auth users (so people can sign in) requires either manual creation in the Supabase Auth dashboard or a server-side seeder that uses the Supabase service-role key (sensitive). I can add a secure dev seeder if you want; you'll need to provide or add the service key to your `.env`.

If you want, I'll now:
- Apply further DB constraints (unique indexes, RLS policies) and wire the admin unlock endpoint.
- Add a secure service-role seeder script that creates 3 demo Auth users and maps them to `profiles` + `user_roles` (I'll document how to remove credentials after demo).

Shared-goal sync test

There is a test script `supabase/migrations/20260518233000_test_shared_sync.sql` that creates a master goal and two child shared goals, inserts a check-in for the master, and prints the child check-ins (via RAISE NOTICE). Run it manually after migrations to verify shared-goal propagation.
