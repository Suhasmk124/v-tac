# V-Tac

Valorant tactical analytics and counter-pick research platform for a database management project. Next.js App Router, PostgreSQL 17, pgvector and a Python/Pandas import pipeline.

## Run locally

Requires Node.js 22+, pnpm 11+, Docker Desktop and (for CSV imports) Python 3.11+.

```powershell
pnpm install
Copy-Item .env.example .env
# Replace SESSION_SECRET in .env with at least 32 random characters.
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open http://localhost:3000. An unauthenticated synthetic preview works without PostgreSQL. Sign in for live queries. Seed creates `coach@vtac.local` and `scout@vtac.local` and prints a random local password once; use `SEED_PASSWORD` to supply your own. Never commit `.env` or real credentials. Seeding refuses a nonempty database.

The supplied PostgreSQL passwords are **local development defaults**. The database port is bound to localhost. Use separate generated credentials, TLS, a shared login rate limiter and deployment-specific configuration before public hosting. Set `ADMIN_DATABASE_URL` only for local management commands; the deployed app needs `DATABASE_URL` and `SESSION_SECRET` only. The runtime login is a non-owner with no schema creation rights. Role checks occur on the server, and the current user role is reloaded from the database for each request.

## Features

- Dashboard and materialized player leaderboards: ACS, ADR, K/D and event-based headshot rate.
- Map review, historical rosters, round economy, kill timelines and normalized coordinate plots.
- pgvector cosine search using deterministic, unit-normalized 128-dimensional tactical features.
- Counter-pick evidence by opponent, map and agent composition, with round and game sample counts.
- Historical economy win estimate for coaches; a real stored procedure is also available in SQL.
- Bcrypt passwords, signed eight-hour HTTP-only sessions, server-side coach/scout permissions.
- Coach team creation; scouts can explore all read features.
- Tournament-baseline anomaly trigger after 10 observations, recording damage outside three sample standard deviations.
- Transactional CSV import, generated vector features, automated database checks and CI.

## Database design

The proposal's twelve core tables are extended with `game_rosters` (historical team membership), `users` and `alerts`: fifteen tables total. The original proposal is preserved in [project_context_proposal.md](project_context_proposal.md); [docs/PLAN.md](docs/PLAN.md) records implementation corrections. [docs/DATABASE.md](docs/DATABASE.md) describes the relationships and SQL demonstrations. Migration tracking adds one operational table.

```sql
-- Historical loadout estimate: map, our spend, opponent spend, output parameters.
CALL sp_predict_win_probability(1,19500,19500,NULL,NULL);
REFRESH MATERIALIZED VIEW mv_player_leaderboards;
```

The application calls the companion SQL function to retrieve the same estimate. A 0.5 smoothed prior with zero observations is displayed as **No evidence**, not a prediction. Headshot rate counts headshot kill events / all kill events, not headshot hit percentage. Scores in synthetic fixtures are demonstration aggregates, not regulation-compliant match simulations.

## Data and limitations

All bundled values are synthetic. No Riot/VLR data, copyrighted map images or real team records are bundled. A VLR summary export alone cannot reconstruct round economy, positions or exact ACS. See [pipeline/README.md](pipeline/README.md) for normalized CSV contracts. Use only source data you are permitted to process and preserve attribution separately.

Vectors encode explicit numeric features, not language or video understanding. Spatial plots are abstract normalized grids, not map overlays. Search is constrained to the selected map and feature version; hashed agent/weapon bins may collide. Composition rankings are descriptive and confounded by team strength and sample size. There is no calibrated match predictor or automatic VOD parser.

pgvector runs inside PostgreSQL. Confirm that your course accepts SQL plus a vector extension as its multi-database requirement; a rubric requiring two independent database engines would need an additional service.

IVFFlat is optional: after a substantial import, run `db/002_vector_index.sql` and tune lists/probes for your dataset. Small databases use exact vector scans for reliable recall.

## Verification

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm db:test       # running, migrated and seeded database required
pnpm start        # separate terminal
pnpm test:http    # running app required
```

Stage commits are published to the public GitHub repository after each stage. This is an independent academic project, unaffiliated with Riot Games.
