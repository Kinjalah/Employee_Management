# Submission: Employee Management — AtomQuest

- **Working link:** (pending) https://kinjalah.github.io/Employee_Management/  
  Note: GitHub Pages deploy failed in the last run; I can re-run/fix or deploy to Render/Vercel on request.
- **Source repository:** https://github.com/Kinjalah/Employee_Management

## Architecture Diagram

```mermaid
flowchart LR
  Browser -->|Vite App| CDN[GitHub Pages / Render / Vercel]
  Browser -->|Supabase JS| Supabase[Supabase (Auth, Postgres, Storage)]
  subgraph DB
    Postgres[(Postgres with RLS & functions)]
  end
  Supabase --> Postgres
  AdminCI[CI (GitHub Actions)] -->|build & deploy| CDN
  AdminCI -->|optional: run migrations| Supabase

  style Postgres fill:#f9f,stroke:#333,stroke-width:1px
```

## Notes
- The GitHub Actions workflow `CI Build & Deploy (GitHub Pages)` was added to build `npm run build` and publish `./dist` to Pages. The last workflow run failed at the job setup step; logs require GitHub API auth to fetch. I can diagnose and fix the workflow or deploy to Render/Vercel if you prefer.
- To publish now on Render: connect the GitHub repo to Render, create a static site (or web service) that runs `npm ci && npm run build` and serves `dist/`.

If you want, I will:
- Fix the GitHub Actions failure and re-deploy (requires me to fetch the logs or you to share the run logs), or
- Deploy to Render/Vercel (I need your Render/Vercel account access or you can grant the GitHub integration and I will complete setup), or
- Provide step-by-step commands for you to finish deployment.
