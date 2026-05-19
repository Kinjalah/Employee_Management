# Deploying AtomQuest (frontend)

This repository includes a GitHub Actions workflow that builds the Vite React app and deploys the `dist` output to GitHub Pages on pushes to `main`.

Required repository secrets (GitHub Settings → Secrets → Actions):
- `VITE_SUPABASE_URL` — your Supabase project URL (e.g. `https://...supabase.co`)
- `VITE_SUPABASE_PUBLISHABLE_KEY` — the public/publishable key for Supabase (safe for browser builds)

Optional (for running migrations from CI; use only if you understand the risks):
- `SUPABASE_ACCESS_TOKEN` — Personal access token for Supabase CLI to run migrations (recommended to run migrations from a separate job or manually).

Steps to deploy:

1. Push this repo to GitHub (create a repo and push `main`).

   ```bash
   git init
   git add .
   git commit -m "Add CI/CD workflow for GitHub Pages"
   git remote add origin git@github.com:<your-org>/<your-repo>.git
   git branch -M main
   git push -u origin main
   ```

2. In the repository settings, add the secrets listed above.

3. Enable GitHub Pages (source: GitHub Actions) in the Pages settings (the workflow will publish artifacts produced by the run).

4. After pushing, open the Actions tab — the `CI Build & Deploy (GitHub Pages)` workflow will run. When it completes, the site will be available at `https://<your-org>.github.io/<your-repo>/`.

Notes:
- Do NOT include `SUPABASE_SERVICE_ROLE_KEY` in client-side secrets. It is a privileged key and must never be exposed to browsers. Use it only in server-side environments (CI tasks that run securely, or server functions).
- If you prefer Vercel/Netlify, I can add an alternative workflow for those services (they need corresponding tokens: `VERCEL_TOKEN` or `NETLIFY_AUTH_TOKEN`).

Next steps I can take for you:
- Add an automated migration step (requires `SUPABASE_ACCESS_TOKEN` and `SUPABASE_REF`).
- Create a Vercel or Netlify deployment workflow instead.

## Render (recommended for simple static hosting)

- Render supports deploying the Vite frontend as a Static Site. A `render.yaml` manifest has been added to this repository for easy import.
- Quick steps:
   1. Go to Render (https://dashboard.render.com) → New → Static Site → "Connect a repository" and choose `Kinjalah/Employee_Management` (branch `main`).
   2. Build Command: `npm ci && npm run build`
   3. Publish Directory: `dist`
   4. Add these Environment Variables in Render's settings (as secrets):
       - `VITE_SUPABASE_URL`
       - `VITE_SUPABASE_PUBLISHABLE_KEY`
   5. Create and deploy. Render will build and publish the `dist` folder; subsequent pushes to `main` will trigger redeploys.

Notes:
- Render hosts only the frontend in this setup; your Supabase backend (Auth/Postgres/RLS) remains hosted in your Supabase project.
- To enable auto-creation from the repo import flow, use the `render.yaml` manifest at the repo root.
