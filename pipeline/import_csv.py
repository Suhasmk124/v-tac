"""Atomic normalized CSV ingestion. Never scrapes or invents missing telemetry."""
import argparse
import json
import os
from pathlib import Path

import pandas as pd
import psycopg
from psycopg import sql
from dotenv import load_dotenv
from features import embed

TABLES = {
    'teams': 'id,name,region,world_rank',
    'players': 'id,team_id,handle,role',
    'tournaments': 'id,name,start_date,prize_pool',
    'matches': 'id,tournament_id,team1_id,team2_id,played_at,format',
    'maps': 'id,name,release_patch',
    'match_games': 'id,match_id,map_id,game_number,team1_score,team2_score',
    'game_rosters': 'game_id,player_id,team_id',
    'game_rounds': 'id,game_id,round_number,winning_team_id,attacking_team_id,win_condition',
    'player_round_stats': 'id,round_id,game_id,player_id,kills,deaths,assists,damage,combat_score,economy_credits,credits_spent',
    'agent_picks': 'id,game_id,player_id,agent_name',
    'weapon_buys': 'id,round_id,game_id,player_id,weapon_name,armor_tier',
    'kill_events': 'id,round_id,game_id,killer_id,victim_id,weapon_used,is_headshot,seconds_elapsed,x,y',
}


def ingest(folder, dsn):
    # Validate all headers before opening the write transaction.
    frames = {}
    for table, contract in TABLES.items():
        columns = contract.split(',')
        frame = pd.read_csv(folder / f'{table}.csv', dtype=str, keep_default_na=False)
        if list(frame.columns) != columns:
            raise ValueError(f'{table}.csv must have columns in order: {contract}')
        frames[table] = frame
    with psycopg.connect(dsn, connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(864201)")
            for table, frame in frames.items():
                columns = TABLES[table].split(',')
                statement = sql.SQL('INSERT INTO {} ({}) VALUES ({})').format(
                    sql.Identifier(table), sql.SQL(',').join(map(sql.Identifier, columns)),
                    sql.SQL(',').join(sql.Placeholder() for _ in columns))
                cur.executemany(statement, (tuple(None if x == '' else x for x in row)
                                           for row in frame.itertuples(index=False, name=None)))
            rounds = frames['game_rounds']['id'].astype(int).tolist()
            for round_id in rounds:
                cur.execute('SELECT credits_spent,damage FROM player_round_stats WHERE round_id=%s', (round_id,))
                stats = cur.fetchall()
                if len(stats) != 10:
                    raise ValueError(f'Round {round_id} needs 10 observed player stats; partial rounds are not vectorized')
                cur.execute('SELECT x,y,seconds_elapsed,weapon_used FROM kill_events WHERE round_id=%s ORDER BY seconds_elapsed,id', (round_id,))
                kills = [dict(x=float(x) if x is not None else None,
                              y=float(y) if y is not None else None,
                              seconds=float(seconds), weapon=weapon)
                         for x, y, seconds, weapon in cur.fetchall()]
                cur.execute('SELECT a.agent_name FROM agent_picks a JOIN game_rounds r ON r.game_id=a.game_id WHERE r.id=%s', (round_id,))
                agents = [row[0] for row in cur.fetchall()]
                if len(agents) != 10:
                    raise ValueError(f'Round {round_id} needs 10 observed agent picks')
                profile = embed([s[0] for s in stats], [s[1] for s in stats], kills, agents)
                cur.execute("INSERT INTO tactical_embeddings(round_id,profile,feature_version,source) VALUES(%s,%s,'vtac-v1','imported')", (round_id, json.dumps(profile)))
            for table, contract in TABLES.items():
                if not contract.startswith('id,'):
                    continue
                cur.execute(sql.SQL("SELECT setval(pg_get_serial_sequence(%s,'id'), greatest(coalesce((SELECT max(id) FROM {}),0),1), EXISTS(SELECT 1 FROM {}))").format(sql.Identifier(table), sql.Identifier(table)), (table,))
            cur.execute('REFRESH MATERIALIZED VIEW mv_player_leaderboards')
    return len(rounds)


if __name__ == '__main__':
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('folder', type=Path)
    args = parser.parse_args()
    dsn = os.environ.get('ADMIN_DATABASE_URL')
    if not dsn:
        parser.error('Set ADMIN_DATABASE_URL in your environment or .env')
    print(f'Imported {ingest(args.folder, dsn)} rounds and refreshed vectors/leaderboards.')
