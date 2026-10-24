"""Append real VCT Reference records without fabricating player-round or spatial telemetry."""
import argparse
import hashlib
import json
import math
import os
from datetime import timezone
from pathlib import Path
import duckdb
import psycopg
from psycopg.types.json import Jsonb
from dotenv import load_dotenv


def rows(db, statement, args=None):
    cursor = db.execute(statement, args or [])
    names = [c[0] for c in cursor.description]
    return [dict(zip(names, row)) for row in cursor.fetchall()]


def economy_embedding(ours, theirs, our_bank, their_bank, round_number, attacking):
    # Distinct contract from vtac-v1: no damage, location, event or composition claims.
    v = [0.0] * 128
    v[:8] = [1, ours / 30000, theirs / 30000, our_bank / 45000,
             their_bank / 45000, min(round_number, 36) / 36,
             1 if attacking else 0, 0 if attacking else 1]
    norm = math.sqrt(sum(x*x for x in v))
    return [x / norm for x in v]


def _ingest(path, dsn, year, event, source):
    sha = hashlib.sha256(path.read_bytes()).hexdigest()
    selection = json.dumps({'year': year, 'event': event}, sort_keys=True)
    conditions = "listing_status='Completed' AND NOT coalesce(is_showmatch,false) AND utc_timestamp IS NOT NULL"
    args = []
    if year:
        conditions += ' AND year(utc_timestamp)=?'
        args.append(year)
    if event:
        conditions += ' AND event=?'
        args.append(event)
    selected = rows(source, 'SELECT * FROM matches WHERE '+conditions+' ORDER BY utc_timestamp,match_id', args)
    if not selected:
        raise ValueError('No completed matches match this selection')
    teams = {str(t['team_id']): t for t in rows(source, 'SELECT * FROM teams')}
    players = {str(p['player_id']): p for p in rows(source, 'SELECT * FROM players')}
    counts = dict(matches=0, games=0, rounds=0, player_maps=0, economy_rounds=0, vectors=0, skipped_existing=0)
    with psycopg.connect(dsn, connect_timeout=10) as conn:
        cur = conn.cursor()
        cur.execute('SELECT pg_advisory_xact_lock(864201)')
        previous = cur.execute('SELECT counts FROM data_imports WHERE source_slug=%s AND sha256=%s AND selection=%s', ('vct-reference',sha,selection)).fetchone()
        if previous:
            return {'already_imported': True, **previous[0]}
        import_id = cur.execute('INSERT INTO data_imports(source_slug,sha256,selection,counts) VALUES(%s,%s,%s,%s) RETURNING id', ('vct-reference',sha,selection,Jsonb({}))).fetchone()[0]
        team_ids, player_ids, event_ids = {}, {}, {}

        def identity(table, key, label, extra_columns, extra_values):
            existing = cur.execute(f'SELECT id FROM {table} WHERE source_key=%s', (key,)).fetchone()
            if existing:
                return existing[0]
            # Different source identities with the same display name must not be merged.
            column = 'handle' if table=='players' else 'name'
            if cur.execute(f'SELECT 1 FROM {table} WHERE {column}=%s', (label,)).fetchone():
                label += ' ['+key+']'
            columns = ','.join([column,'source_key']+extra_columns)
            placeholders = ','.join(['%s']*(2+len(extra_columns)))
            return cur.execute(f'INSERT INTO {table}({columns}) VALUES({placeholders}) RETURNING id', [label,key]+extra_values).fetchone()[0]

        for match in selected:
            match_key = 'vlr:'+match['match_id']
            if cur.execute('SELECT 1 FROM matches WHERE source_key=%s', (match_key,)).fetchone():
                counts['skipped_existing'] += 1
                continue
            if match['team0_id'] is None or match['team1_id'] is None:
                raise ValueError(f'Missing participant on source match {match_key}')
            local_teams=[]
            for external in (match['team0_id'],match['team1_id']):
                key=str(external)
                if key not in team_ids:
                    t=teams[key]
                    team_ids[key]=identity('teams','vlr:'+key,t['team_name'],['region','country'],['Unknown',t['country']])
                local_teams.append(team_ids[key])
            event_key=str(match['event_id'])
            if event_key not in event_ids:
                start=source.execute('SELECT min(utc_timestamp)::DATE FROM matches WHERE event_id=?',[match['event_id']]).fetchone()[0]
                event_ids[event_key]=identity('tournaments','vlr:'+event_key,match['event'],['start_date','prize_pool'],[start,None])
            timestamp=match['utc_timestamp'].replace(tzinfo=timezone.utc)
            fmt={'Bo1':1,'Bo3':3,'Bo5':5}[match['format']]
            url=match['url'] if (match['url'] or '').startswith('https://www.vlr.gg/') else None
            mid=cur.execute('INSERT INTO matches(tournament_id,team1_id,team2_id,played_at,format,data_source,source_key,source_url,patch,veto,import_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id', (event_ids[event_key],*local_teams,timestamp,fmt,'vct-reference',match_key,url,match['patch'],Jsonb(match['veto']),import_id)).fetchone()[0]
            counts['matches']+=1
            games=rows(source,'SELECT * FROM maps WHERE match_id=? AND score0 IS NOT NULL AND score1 IS NOT NULL AND map_name IS NOT NULL ORDER BY try_cast(game_id AS BIGINT)',[match['match_id']])
            for game_number, game in enumerate(games,1):
                map_id=cur.execute('INSERT INTO maps(name) VALUES(%s) ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id',(game['map_name'],)).fetchone()[0]
                gid=cur.execute('INSERT INTO match_games(match_id,map_id,game_number,team1_score,team2_score,source_key) VALUES(%s,%s,%s,%s,%s,%s) RETURNING id',(mid,map_id,game_number,game['score0'],game['score1'],'vlr:'+game['game_id'])).fetchone()[0]
                counts['games']+=1
                expected=game['score0']+game['score1']
                player_rows=rows(source,'SELECT * FROM player_map WHERE match_id=? AND game_id=?',[match['match_id'],game['game_id']])
                for p in player_rows:
                    if p['team_idx'] not in (0,1):
                        raise ValueError('Unknown player team index')
                    external=str(p['player_id'])
                    if external not in player_ids:
                        player_ids[external]=identity('players','vlr:'+external,players[external]['player_name'],['role'],['Unknown'])
                    pid=player_ids[external]; tid=local_teams[p['team_idx']]
                    cur.execute('INSERT INTO game_rosters(game_id,player_id,team_id) VALUES(%s,%s,%s)',(gid,pid,tid))
                    if p['agents'] and len(p['agents'])==1:
                        agent='KAY/O' if p['agents'][0]=='kayo' else p['agents'][0].title()
                        cur.execute('INSERT INTO agent_picks(game_id,player_id,agent_name) VALUES(%s,%s,%s)',(gid,pid,agent))
                    if expected>0:
                        cur.execute('INSERT INTO player_game_stats(game_id,player_id,team_id,rounds_played,kills,deaths,assists,acs,adr,headshot_pct,kast,first_kills,first_deaths) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',(gid,pid,tid,expected,p['kills_all'],p['deaths_all'],p['assists_all'],p['acs_all'],p['adr_all'],p['hs_pct_all'],p['kast_all'],p['fk_all'],p['fd_all']))
                        counts['player_maps']+=1
                rounds=rows(source,'SELECT * FROM rounds WHERE match_id=? AND game_id=? ORDER BY round_num',[match['match_id'],game['game_id']])
                observed=0; economy_count=0
                for r in rounds:
                    if r['winner_team'] not in (0,1):
                        continue
                    winner=local_teams[r['winner_team']]
                    attacking=(winner if r['side']=='attack' else local_teams[1-r['winner_team']]) if r['side'] in ('attack','defense') else None
                    condition={'elimination':'Elimination','bomb_detonated':'Detonation','defuse':'Defuse','time_expired':'Time'}.get(r['outcome'],'Unknown')
                    rid=cur.execute('INSERT INTO game_rounds(game_id,round_number,winning_team_id,attacking_team_id,win_condition) VALUES(%s,%s,%s,%s,%s) RETURNING id',(gid,r['round_num'],winner,attacking,condition)).fetchone()[0]
                    observed+=1; counts['rounds']+=1
                    # Only the publisher's coverage-approved economy block is eligible.
                    if game['economy_available']:
                        for i,tid in enumerate(local_teams):
                            cur.execute('INSERT INTO team_round_economy(round_id,game_id,team_id,loadout_value,bank) VALUES(%s,%s,%s,%s,%s)',(rid,gid,tid,r[f'loadout_t{i}'],r[f'bank_t{i}']))
                        if all(r[k] is not None for k in ['loadout_t0','loadout_t1','bank_t0','bank_t1']) and attacking is not None:
                            profile=economy_embedding(r['loadout_t0'],r['loadout_t1'],r['bank_t0'],r['bank_t1'],r['round_num'],attacking==local_teams[0])
                            cur.execute("INSERT INTO tactical_embeddings(round_id,profile,feature_version,source) VALUES(%s,%s,'vtac-economy-v1','imported')",(rid,json.dumps(profile)))
                            counts['vectors']+=1;economy_count+=1
                counts['economy_rounds']+=economy_count
                cur.execute('INSERT INTO map_coverage VALUES(%s,%s,%s,false,%s,%s,%s)',(gid,len(player_rows)==10,economy_count==expected and expected>0,bool(game['performance_available']),observed,expected))
        cur.execute('UPDATE data_imports SET counts=%s WHERE id=%s',(Jsonb(counts),import_id))
    return counts


def ingest(path, dsn, year=2025, event=None):
    with duckdb.connect(str(path), read_only=True, config={'enable_external_access':False}) as source:
        return _ingest(path,dsn,year,event,source)


if __name__=='__main__':
    load_dotenv()
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('database',type=Path)
    parser.add_argument('--year',type=int,default=2025)
    parser.add_argument('--event',default=None)
    args=parser.parse_args()
    if not os.environ.get('ADMIN_DATABASE_URL'):
        parser.error('Set ADMIN_DATABASE_URL')
    print(json.dumps(ingest(args.database,os.environ['ADMIN_DATABASE_URL'],args.year,args.event),indent=2))
