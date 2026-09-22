import pg from 'pg';
const {Pool} = pg;
const p = new Pool({connectionString: process.env.DATABASE_URL});
const r = await p.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
console.log(r.rows.map(x=>x.table_name).join(', '));
await p.end();
