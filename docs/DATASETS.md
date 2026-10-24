# Public dataset selection and provenance

V-Tac now uses [VCT Reference's public DuckDB export](https://vct-reference.com/dataset), downloaded on 24 October 2026. The publisher describes it as free to use, including commercially, under its [site terms](https://vct-reference.com/terms), with no accuracy warranty. It is derived from public professional match pages. Attribution is retained in the app and here; no official Riot endorsement is implied.

The imported selection is the completed, non-showmatch **2025 season**:

| Records | Imported |
|---|---:|
| Series | 498 |
| Maps | 1,272 |
| Rounds | 26,873 |
| Player-map observations | 12,720 |
| Fully observed economy round vectors | 21,164 |

Snapshot SHA-256: `111f09a543ac79acf11ca4ded6b2abd7e6ba48c1bae11f5626b21de0d2e88848`. The live download URL is mutable: future downloads may have a different fingerprint and counts. The application records the actual file fingerprint, selection, import time and counts in `data_imports`, and links each imported match to its import. Binary snapshots stay under ignored `.tools/datasets/`, outside Git.

## Why this source

The downloaded schema contains series metadata and veto text, map scores, player **map-level** ACS/ADR/KDA/KAST/HS%, agents, round outcomes and optional **team-level loadout/bank** values. That supports real match exploration, map-pool scouting, side and pistol rates, composition evidence and economy-pattern search.

I also evaluated [Bernie Laird's VCT project](https://github.com/bernielaird/vctstats). Its code describes granular replay extraction, but the underlying scraped database is not redistributed; reproducing it requires a separate scraping job. [GRID](https://grid.gg/data/games/valorant/) provides official granular telemetry through access arrangements rather than this public bulk-download workflow. Neither is required to run V-Tac.

## Missing data is not zero

- No player-round damage, individual round buys, timed kill feed or coordinates are present in this export. These tables are deliberately left empty for public records. The public round screen shows team economy and an explicit availability message.
- Coverage varies. The importer honors the publisher's `economy_available` gate. A vector also requires both loadouts, both banks and a known side. The source's performance-block flag is preserved separately from the presence of ten player-map rows.
- Unknown outcomes stay `Unknown`, missing bank/ACS/ADR/HS% stay SQL NULL, and unknown current roles/team memberships are not inferred from historical appearances.
- Published map ACS/ADR are weighted by scoreboard rounds when aggregating. They are already rounded source averages, so the season aggregate is an approximation. Aggregate HS% is withheld because hit denominators are not available; individual map HS% remains available with its source label.
- Side denotes the winning team's side in this source. The adapter resolves the attacking team from winner and side. Pistol reports count rounds 1 and 13, excluding overtime resets.
- Completed map scores and observed round strips may have different coverage. `map_coverage` stores both expected and observed round counts. Missing round detail is not synthesized.
- Team/player display names follow the downloaded snapshot's canonical names and may differ from the brand or handle used on a historical match date. Historical membership is still attached to the recorded game roster.

## Reproduce the import

```powershell
python -m pip install -r pipeline/requirements.txt
pnpm db:migrate
python pipeline/fetch_vct.py
python pipeline/import_vct.py .tools/datasets/vct.duckdb --year 2025
# Optional narrower selection:
python pipeline/import_vct.py .tools/datasets/vct.duckdb --year 2025 --event "Valorant Champions 2025"
```

Imports append new source identities in one transaction. Repeating the same file and selection returns the previous import report. Overlapping selections skip existing matches. Changes to already imported source matches are not silently applied: a reviewed correction/update workflow would be needed. Existing synthetic fixtures and user accounts are retained.

## Economy feature contract

`vtac-economy-v1` is independent of the original `vtac-v1` spatial fixture encoder. Its first eight values are bias, first-listed/opponent loadout divided by 30,000, first-listed/opponent bank divided by 45,000, round number capped at 36 and divided by 36, and first-listed-team attack/defense indicators. Values are L2-normalized. The remaining 120 vector slots are reserved zeroes, not additional observed features. No outcome or future player statistic is encoded.

The app compares only the same source, map and feature version. Similarity is a descriptive economy-pattern score; it does not establish an identical setup, retake, strategy or win probability. The separate historical economy estimate uses recorded loadout rather than spending and reports its sample size. Map-veto reports include 95% Wilson binomial ranges, but repeated maps, opponent strength, patch changes and veto selection limit their interpretation.
