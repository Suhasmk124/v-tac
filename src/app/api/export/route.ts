import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { csvCell } from "@/lib/scouting";
import { z } from "zod";
export async function GET(request: Request) {
  await requireUser();
  const url = new URL(request.url);
  const event = z.coerce
    .number()
    .int()
    .min(0)
    .max(2147483647)
    .catch(0)
    .parse(url.searchParams.get("event") ?? 0);
  const rows = await query(
    `SELECT t.name tournament,m.played_at,p.name map,a.name team,pl.handle player,s.rounds_played,s.kills,s.deaths,s.assists,s.acs,s.adr,s.headshot_pct source_hs_pct,s.kast,m.source_url FROM player_game_stats s JOIN match_games g ON g.id=s.game_id JOIN matches m ON m.id=g.match_id JOIN tournaments t ON t.id=m.tournament_id JOIN maps p ON p.id=g.map_id JOIN teams a ON a.id=s.team_id JOIN players pl ON pl.id=s.player_id WHERE m.data_source='vct-reference' AND ($1::int=0 OR t.id=$1) ORDER BY m.played_at DESC,g.id,s.player_id LIMIT 5000`,
    [event],
  );
  const columns = [
    "tournament",
    "played_at",
    "map",
    "team",
    "player",
    "rounds_played",
    "kills",
    "deaths",
    "assists",
    "acs",
    "adr",
    "source_hs_pct",
    "kast",
    "source_url",
  ];
  const csv = [
    columns.map(csvCell).join(","),
    ...rows.map((r) =>
      columns
        .map((c) => csvCell(r[c] instanceof Date ? r[c].toISOString() : r[c]))
        .join(","),
    ),
  ].join("\r\n");
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="vtac-player-map-stats.csv"',
      "Cache-Control": "no-store",
      "X-Export-Row-Limit": "5000",
    },
  });
}
