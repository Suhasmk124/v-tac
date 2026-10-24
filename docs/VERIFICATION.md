# Verification — 24 October 2026

Local Windows verification completed against PostgreSQL 17 with pgvector and the production Next.js build.

| Check | Result |
|---|---|
| TypeScript checking | Passed |
| Production build using Webpack | Passed; application routes and CSV export compiled |
| TypeScript feature/statistics/export tests | 6 passed |
| Python feature tests | 2 passed |
| Database integration | Fixture counts, cosine parity, procedure outputs, leaderboard cardinality, invalid foreign keys, anomaly trigger and restricted database privileges passed |
| CSV round trip | 144 rounds imported into a disposable database; every vector matched the TypeScript fixture within 1e-6 |
| Failed-import rollback | Invalid final-file foreign key left zero imported team rows |
| Public VCT adapter | Offline source-shaped fixture passed atomic rollback, duplicate prevention, side mapping, nullable values, coverage gates and absence of fabricated telemetry |
| Real dataset import | 498 matches, 1,272 maps, 26,873 rounds, 12,720 player-map observations and 21,164 economy vectors; repeat import reported already imported |
| HTTP checks | Demo, authentication, real and synthetic detail pages, library, scouting, provenance, CSV export, map/source boundaries, coach note persistence and direct scout write rejection passed |
| Formatting / whitespace | Passed |

Fixtures contain 6 games, 144 rounds, 15 players, 1,440 player-round records and 720 kill events. They are synthetic and do not model regulation-compliant match termination.

Browser sign-in, the real-data dashboard and opponent report were inspected in the in-app browser. A report screenshot is saved locally under ignored `.tools/scouting-preview.png`. Other route checks use HTTP assertions. No claim of exhaustive browser/device coverage is made.

The GitHub workflow repeats build, unit, database, both pipeline adapters and HTTP checks on Linux. The complete public-data foundation run [passed](https://github.com/Suhasmk124/v-tac/actions/runs/40107654066). Subsequent commits repeat these checks; their latest status is visible in the repository's Actions tab.
