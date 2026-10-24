-- Run after substantial imports; tune lists to dataset size and ANALYZE.
CREATE INDEX IF NOT EXISTS tactical_profile_ivfflat ON tactical_embeddings USING ivfflat(profile vector_cosine_ops) WITH(lists=10);
ANALYZE tactical_embeddings;
