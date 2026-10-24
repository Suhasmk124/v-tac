# Verification — 24 October 2026

Local Windows verification completed against PostgreSQL 17 with pgvector and the production Next.js build.

| Check | Result |
|---|---|
| TypeScript checking | Passed |
| Production build using Webpack | Passed; all eight application routes compiled |
| TypeScript feature tests | 4 passed |
| Python feature tests | 2 passed |
| Database integration | Fixture counts, cosine parity, procedure outputs, leaderboard cardinality, invalid foreign keys, anomaly trigger and restricted database privileges passed |
| CSV round trip | 144 rounds imported into a disposable database; every vector matched the TypeScript fixture within 1e-6 |
| Failed-import rollback | Invalid final-file foreign key left zero imported team rows |
| HTTP checks | Demo, authenticated pages, actual bcrypt login/cookie issuance, invalid cookie rejection, coach/scout visibility, roster access restriction and direct scout write denial passed |
| Formatting / whitespace | Passed |

Fixtures contain 6 games, 144 rounds, 15 players, 1,440 player-round records and 720 kill events. They are synthetic and do not model regulation-compliant match termination.

Browser-based visual inspection could not be completed: computer control stopped because the current browser URL could not be verified. HTTP rendering and responsive styles were checked in code; no claim of screenshot-based visual verification is made.

The GitHub workflow repeats build, unit, database, pipeline and HTTP checks on Linux. Its latest run is visible in the repository's Actions tab; local success does not by itself establish remote CI success.
