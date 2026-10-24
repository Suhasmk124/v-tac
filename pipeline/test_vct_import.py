"""Offline adapter checks using a deliberately synthetic source-shaped DuckDB fixture."""
import os
import tempfile
import uuid
from pathlib import Path
import duckdb
import psycopg
from psycopg import sql
from psycopg.conninfo import make_conninfo
from dotenv import load_dotenv
from import_vct import ingest, economy_embedding


def fixture(path):
    with duckdb.connect(str(path)) as d:
        d.execute("CREATE TABLE matches AS SELECT '1001' match_id,'https://www.vlr.gg/1001' url,'Synthetic adapter fixture' AS \"event\",99 event_id,TIMESTAMP '2025-09-01 12:00:00' utc_timestamp,100 team0_id,200 team1_id,'Bo3' format,'Completed' listing_status,false is_showmatch,'test' patch,['RED ban Bind'] veto")
        d.execute("CREATE TABLE teams AS SELECT 100 team_id,'Fixture Red' team_name,'xx' country UNION ALL SELECT 200,'Fixture Blue','xx'")
        d.execute("CREATE TABLE players AS SELECT 1000+i player_id,'FixturePlayer'||i player_name FROM range(10) t(i)")
        d.execute("CREATE TABLE maps AS SELECT '1001' match_id,'2001' game_id,'Ascent' map_name,13 score0,11 score1,true economy_available,true performance_available")
        d.execute("CREATE TABLE player_map AS SELECT 1000+i player_id,'1001' match_id,'2001' game_id,CASE WHEN i<5 THEN 0 ELSE 1 END team_idx,['omen'] agents,CASE WHEN i=0 THEN NULL ELSE 200 END acs_all,130 adr_all,15 kills_all,12 deaths_all,5 assists_all,25 hs_pct_all,70 kast_all,2 fk_all,2 fd_all FROM range(10) t(i)")
        d.execute("CREATE TABLE rounds AS SELECT '1001' match_id,'2001' game_id,i::int round_num,CASE WHEN i<=13 THEN 0 ELSE 1 END winner_team,CASE WHEN i<=12 OR i>13 THEN 'attack' ELSE 'defense' END side,CASE WHEN i=24 THEN NULL ELSE 'elimination' END outcome,20000 loadout_t0,19000 loadout_t1,1000 bank_t0,CASE WHEN i=24 THEN NULL ELSE 1000 END bank_t1 FROM range(1,25) t(i)")


def main():
    load_dotenv();dsn=os.environ['ADMIN_DATABASE_URL'];name='vtac_test_'+uuid.uuid4().hex
    target=make_conninfo(dsn,dbname=name)
    with psycopg.connect(dsn,autocommit=True,connect_timeout=10) as admin:
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
        try:
            with psycopg.connect(target) as c:
                for migration in ['001_schema.sql','003_public_data.sql']:
                    c.execute(Path('db',migration).read_text(encoding='utf8'))
            with tempfile.TemporaryDirectory() as directory:
                path=Path(directory)/'fixture.duckdb';fixture(path)
                with duckdb.connect(str(path)) as d:
                    d.execute('UPDATE rounds SET bank_t0=-1 WHERE round_num=24')
                try:
                    ingest(path,target)
                    raise AssertionError('Negative final economy record must fail')
                except psycopg.errors.CheckViolation:
                    pass
                with psycopg.connect(target) as c:
                    assert c.execute('SELECT count(*) FROM matches').fetchone()[0]==0
                    assert c.execute('SELECT count(*) FROM data_imports').fetchone()[0]==0
                with duckdb.connect(str(path)) as d:
                    d.execute('UPDATE rounds SET bank_t0=1000 WHERE round_num=24')
                result=ingest(path,target)
                assert result['matches']==1 and result['rounds']==24 and result['vectors']==23
                assert ingest(path,target)['already_imported']
                with psycopg.connect(target) as c:
                    assert c.execute('SELECT count(*) FROM player_round_stats').fetchone()[0]==0
                    assert c.execute('SELECT count(*) FROM kill_events').fetchone()[0]==0
                    assert c.execute('SELECT count(*) FROM player_game_stats WHERE acs IS NULL').fetchone()[0]==1
                    assert c.execute('SELECT count(*) FROM team_round_economy WHERE bank IS NULL').fetchone()[0]==1
                    assert c.execute("SELECT count(*) FROM game_rounds WHERE win_condition='Unknown'").fetchone()[0]==1
                    assert c.execute('SELECT count(*) FROM data_imports').fetchone()[0]==1
                    assert c.execute('SELECT count(*) FROM map_coverage WHERE economy=false').fetchone()[0]==1
                    assert c.execute('SELECT count(*) FROM game_rounds WHERE round_number<=12 AND attacking_team_id<>(SELECT min(id) FROM teams)').fetchone()[0]==0
            vector=economy_embedding(20000,19000,1000,1000,1,True)
            assert len(vector)==128 and abs(sum(x*x for x in vector)-1)<1e-12
            print('VCT adapter checks passed: atomic rollback, idempotency, side mapping, nullable stats, coverage and economy-only vectors; no fabricated telemetry.')
        finally:
            admin.execute(sql.SQL('DROP DATABASE {} WITH(FORCE)').format(sql.Identifier(name)))


if __name__=='__main__':
    main()
