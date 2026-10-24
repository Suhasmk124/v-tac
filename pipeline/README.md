# Normalized telemetry import

For the public dataset now used by the app, follow [the VCT Reference adapter instructions](../docs/DATASETS.md). This page describes the separate custom CSV contract for sources that actually contain individual round telemetry.

This is a normalized CSV importer, **not an adapter for arbitrary VLR CSV or SQLite exports**. Source schemas vary; map a licensed source into these contracts before importing. Never infer missing positions, combat score or economy from match summary stats.

```powershell
python -m pip install -r pipeline/requirements.txt
python pipeline/import_csv.py path/to/normalized-csv-folder
```

The importer reads ADMIN_DATABASE_URL from `.env` or the process environment. Run schema migrations first. Create users separately with `pnpm user:create` using `NEW_USER_EMAIL`, `NEW_USER_ROLE` and `NEW_USER_PASSWORD` environment variables (12+ characters). Never use the administrative import connection in the hosted app.

Provide all twelve CSV files below, UTF-8, with exactly these ordered headers. Empty fields mean SQL NULL. Use PostgreSQL-compatible integers, decimals, ISO dates/timestamps and `true`/`false` booleans. `world_rank`, `team_id` on players, `release_patch` and both coordinates may be empty; mandatory fields are enforced by database constraints. Coordinates must both be present or both empty and be normalized to [0,1] within the same map coordinate frame.

| File | Header |
|---|---|
| teams.csv | id,name,region,world_rank |
| players.csv | id,team_id,handle,role |
| tournaments.csv | id,name,start_date,prize_pool |
| matches.csv | id,tournament_id,team1_id,team2_id,played_at,format |
| maps.csv | id,name,release_patch |
| match_games.csv | id,match_id,map_id,game_number,team1_score,team2_score |
| game_rosters.csv | game_id,player_id,team_id |
| game_rounds.csv | id,game_id,round_number,winning_team_id,attacking_team_id,win_condition |
| player_round_stats.csv | id,round_id,game_id,player_id,kills,deaths,assists,damage,combat_score,economy_credits,credits_spent |
| agent_picks.csv | id,game_id,player_id,agent_name |
| weapon_buys.csv | id,round_id,game_id,player_id,weapon_name,armor_tier |
| kill_events.csv | id,round_id,game_id,killer_id,victim_id,weapon_used,is_headshot,seconds_elapsed,x,y |

All files are loaded in dependency order in one transaction. Errors roll back inserted rows, vectors and refreshed leaderboards; PostgreSQL sequence advancement itself is not transactional and gaps are harmless. Existing IDs or unique keys cause an error, never an overwrite. For incremental imports, include only new parent rows; header-only files can reference existing parents. Every imported round needs exactly ten stat rows and ten picks. Empty event files are supported but imply incomplete event-derived features. Keep complete and incomplete telemetry sets separate when interpreting results.

Embeddings are generated in the same transaction using `vtac-v1`: 8 aggregate features, 8 damage histogram bins, 64 spatial bins, 16 timing bins, 16 weapon hash bins and 16 agent hash bins. Hashing is deterministic; bins can collide. Normalization uses the L2 norm. The TypeScript and Python encoders have parity checks in CI.

Import actual scrimmage records here; the application handles read exploration and coach team/roster management. A browser upload workflow and source-specific VLR/SQLite adapters are future extensions.
