# V-Tac delivery stages

1. Database foundation: normalized schema, integrity constraints, roles, anomaly trigger, materialized leaderboards, historical economy estimator, deterministic 128-dimensional vectors, reproducible synthetic fixtures.
2. Application: Next.js dashboard, match and round exploration, similarity search, counter-pick evidence, bcrypt authentication and coach-only writes.
3. Pipeline and verification: transactional normalized CSV importer, database integration checks, application tests, CI and handover documentation.

Each stage is committed and pushed independently. Original proposal is preserved in project_context_proposal.md.

## Design corrections

- Add users, sessions via signed expiring cookies, alerts and roster snapshots to the 12 domain tables. A player's current team must not rewrite historical participation.
- Coordinates, timing, assists, combat score and credits spent are separate fields. ACS cannot be inferred accurately from total damage and kills alone.
- Index hierarchical keys on their owning tables rather than on nonexistent columns.
- Vector features are explicit engineered numeric features, not learned semantic embeddings. Similarity is approximate evidence, not proof of identical tactics.
- Counter-pick recommendations summarize historical opponent composition win rates, with sample counts; no causal or predictive claim.
- IVFFlat indexing is an optional post-import operation; small fixtures use exact search.
- Real VLR exports may lack granular telemetry. The importer requires normalized CSV contracts and never fabricates missing observations.
- pgvector shares PostgreSQL's engine. Confirm the course rubric accepts an extension as its second database paradigm.
