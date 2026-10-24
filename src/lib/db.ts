import pg from 'pg';
const globalDb=globalThis as unknown as {pool:pg.Pool|undefined};
export function database() {
 if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
 return globalDb.pool??=new pg.Pool({connectionString:process.env.DATABASE_URL,max:8,connectionTimeoutMillis:4000});
}
export async function query<T extends pg.QueryResultRow=pg.QueryResultRow>(sql:string,args:unknown[]=[]) {return (await database().query<T>(sql,args)).rows;}
