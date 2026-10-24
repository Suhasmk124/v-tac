"""CI-only source-shaped fixture so HTTP checks exercise the public-data branch offline."""
import os
import tempfile
from pathlib import Path
from test_vct_import import fixture
from import_vct import ingest

if os.environ.get('CI') != 'true':
    raise SystemExit('This synthetic public-schema fixture is restricted to CI test databases.')
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'synthetic-ci-only.duckdb'
    fixture(path)
    print(ingest(path, os.environ['ADMIN_DATABASE_URL']))
