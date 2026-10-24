"""Round-trip synthetic fixtures through CSV into an isolated temporary database."""
import csv
import json
import os
import tempfile
import uuid
from pathlib import Path

import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
from dotenv import load_dotenv
from import_csv import TABLES, ingest


def main():
    load_dotenv()
    dsn = os.environ['ADMIN_DATABASE_URL']
    name = 'vtac_test_' + uuid.uuid4().hex
    test_dsn = make_conninfo(dsn, dbname=name)
    with psycopg.connect(dsn, autocommit=True, connect_timeout=10) as admin:
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
        try:
            with psycopg.connect(test_dsn) as target:
                target.execute(Path('db/001_schema.sql').read_text(encoding='utf8'))
            with tempfile.TemporaryDirectory() as directory:
                folder = Path(directory)
                with admin.cursor() as cur:
                    for table, contract in TABLES.items():
                        columns = contract.split(',')
                        cur.execute(sql.SQL('SELECT {} FROM {} ORDER BY 1').format(sql.SQL(',').join(map(sql.Identifier, columns)), sql.Identifier(table)))
                        with (folder / f'{table}.csv').open('w', newline='', encoding='utf8') as file:
                            writer = csv.writer(file)
                            writer.writerow(columns)
                            writer.writerows(cur.fetchall())
                    cur.execute('SELECT round_id,profile::text FROM tactical_embeddings ORDER BY round_id')
                    original = dict(cur.fetchall())
                # Fail at the final dependent table, after earlier rows were inserted.
                kill_file = folder / 'kill_events.csv'
                valid = kill_file.read_text(encoding='utf8')
                rows = list(csv.reader(valid.splitlines()))
                rows[-1][rows[0].index('victim_id')] = '999999'
                with kill_file.open('w', newline='', encoding='utf8') as file:
                    csv.writer(file).writerows(rows)
                try:
                    ingest(folder, test_dsn)
                    raise AssertionError('Invalid final file should have failed')
                except psycopg.errors.ForeignKeyViolation:
                    pass
                with psycopg.connect(test_dsn) as target:
                    assert target.execute('SELECT count(*) FROM teams').fetchone()[0] == 0
                kill_file.write_text(valid, encoding='utf8')
                assert ingest(folder, test_dsn) == 144
                with psycopg.connect(test_dsn) as target:
                    for round_id, vector in target.execute('SELECT round_id,profile::text FROM tactical_embeddings'):
                        assert max(abs(a-b) for a, b in zip(json.loads(vector), json.loads(original[round_id]))) < 1e-6
                    assert target.execute('SELECT count(*) FROM mv_player_leaderboards').fetchone()[0] == 15
                print('CSV checks passed: complete round trip, atomic rollback, all 144 vectors match TypeScript fixtures.')
        finally:
            admin.execute(sql.SQL('DROP DATABASE {} WITH (FORCE)').format(sql.Identifier(name)))


if __name__ == '__main__':
    main()
