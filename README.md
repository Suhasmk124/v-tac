# V-Tac

Valorant tactical analytics and counter-pick research platform for a database management project. Next.js App Router, PostgreSQL 17, pgvector and a Python/Pandas import pipeline.

The upgraded workspace supports **real 2025 VCT data**: 498 matches, 1,272 maps, 26,873 rounds and 12,720 player-map observations in the verified snapshot. Real and synthetic datasets have separate views and vector contracts. See [dataset provenance and reproduction](docs/DATASETS.md).

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

The supplied PostgreSQL passwords are **local development defaults**. The database port is bound to localhost. Use separate generated credentials, TLS, a shared login rate limiter and deployment-specific configuration before public hosting. Set `ADMIN_DATABASE_URL` only for local management commands; the deployed app needs `DATABASE_URL` and `SESSION_SECRET` only. The runtime login is a non-owner with no schema creation rights. Role checks occur on the server, and the current user role is reloaded from the database for each request. Bcrypt passwords are limited to 72 UTF-8 bytes to prevent silent truncation.

## Features

- Dashboard and materialized player leaderboards: ACS, ADR, K/D and event-based headshot rate.
- Map review, historical rosters, round economy, kill timelines and normalized coordinate plots.
- pgvector cosine search using deterministic, unit-normalized 128-dimensional tactical features.
- Counter-pick evidence by opponent, map and agent composition, with round and game sample counts.
- Historical economy win estimate for coaches; a real stored procedure is also available in SQL.
- Bcrypt passwords, signed eight-hour HTTP-only sessions, server-side coach/scout permissions.
- Coach team creation and current roster updates; scouts can explore all read features.
- Tournament-baseline anomaly trigger after 10 observations, recording damage outside three sample standard deviations.
- Transactional CSV import, generated vector features, automated database checks and CI.
- Public DuckDB snapshot adapter with SHA-256 provenance, coverage checks, atomic imports and duplicate prevention.
- Searchable, paginated map library with team, event and map filters; original source links and veto history.
- Opponent map-pool reports, minimum-sample thresholds and 95% Wilson ranges for map-veto evidence.
- Attack/defense splits, pistol results and recorded loadout-tier performance.
- Coach-only scouting notes, readable by scouts; authenticated CSV export of up to 5,000 player-map rows, optionally filtered by event.
- Data observatory showing source counts, coverage, import selections and snapshot fingerprints.

## Import the real season

Run after the normal migration and seed steps above. Existing local accounts and fixtures are preserved.

```powershell
python -m pip install -r pipeline/requirements.txt
python pipeline/fetch_vct.py
python pipeline/import_vct.py .tools/datasets/vct.duckdb --year 2025
```

Sign in, select **VCT Reference**, and open Opponent scouting or Full match library. The dashboard selects real data by default once it exists. CSV exports use the event filter and a 5,000-row cap; team/map library filters do not apply to that export. Repeat imports do not duplicate matches. Upstream corrections to already imported matches are not automatically overwritten.

## Database design

The proposal's twelve core tables are extended with historical rosters, users, alerts, data sources/imports, coverage, player-map statistics, team-round economy and notes: twenty-one domain tables. The original proposal is preserved in [project_context_proposal.md](project_context_proposal.md); [docs/PLAN.md](docs/PLAN.md) records implementation corrections. [docs/DATABASE.md](docs/DATABASE.md) describes the relationships and SQL demonstrations. Migration tracking adds one operational table. Numbered migrations run in order; `002_vector_index.sql` remains an optional manual optimization.

```sql
-- Synthetic historical spending estimate: map, our spend, opponent spend, outputs.
CALL sp_predict_win_probability(1,19500,19500,NULL,NULL);
REFRESH MATERIALIZED VIEW mv_player_leaderboards;
```

The synthetic workspace calls the companion SQL function to retrieve the same estimate. The real-data workspace queries recorded team loadout values separately. A 0.5 smoothed prior with zero observations is displayed as **No evidence**, not a prediction. Synthetic headshot rate counts headshot kill events / all kill events; public map HS% uses the publisher's metric. Scores in synthetic fixtures are demonstration aggregates, not regulation-compliant match simulations.

## Data and limitations

Fixtures bundled in Git are synthetic. The real public snapshot is downloaded locally and excluded from Git, with source links and fingerprints recorded by the importer. No copyrighted map images are bundled. The selected export has map-level ACS/ADR and optional team-round loadout/bank; it cannot reconstruct player-round damage or coordinates. See [docs/DATASETS.md](docs/DATASETS.md) for attribution and limitations, and [pipeline/README.md](pipeline/README.md) for custom normalized CSV contracts.

Vectors encode explicit numeric features, not language or video understanding. Spatial plots are available for synthetic fixtures only and use abstract normalized grids, not map overlays. Public rounds use an economy-only encoder. Search is constrained to the selected source, map and feature version; original fixture agent/weapon hash bins may collide. Composition and map-veto rankings are descriptive and confounded by team strength, patch, selection and sample size. There is no calibrated match predictor or automatic VOD parser.

pgvector runs inside PostgreSQL. Confirm that your course accepts SQL plus a vector extension as its multi-database requirement; a rubric requiring two independent database engines would need an additional service.

IVFFlat is optional: after a substantial import, run `db/002_vector_index.sql` and tune lists/probes for your dataset. Small databases use exact vector scans for reliable recall.

## Verification

```powershell
pnpm typecheck
pnpm test
pnpm build
pnpm db:test       # running, migrated and seeded database required
python -m unittest discover -s pipeline -p test_features.py
python pipeline/test_import.py  # temporary database round trip; admin connection required
python pipeline/test_vct_import.py # offline source-shaped fixture; no public download needed
pnpm start        # separate terminal
pnpm test:http    # running app required
```

Stage commits are published to the public GitHub repository after each stage. This is an independent academic project, unaffiliated with Riot Games.
