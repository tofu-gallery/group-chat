// Tofu: set up the chat's database at the start of every build, then build.
//
// 1. Apply supabase/migrations in file-name order, each file once, in its own transaction, recording each version in
//    the Supabase CLI's own ledger (supabase_migrations.schema_migrations), so neither Tofu nor `supabase db push` by a
//    person with the database key ever runs one twice.
// 2. Write the sign-up switch: public.app_settings.sign_up_open is false while NEXT_PUBLIC_DISABLE_SIGN_UP is "true"
//    and true otherwise, and the database refuses new accounts while it is false (the init migration's
//    refuse_closed_sign_up trigger). The setting is read here, at build time, so changing it takes a new deploy.
//
// Tofu hands the build DATABASE_URL and SUPABASE_CA_CERT. Without DATABASE_URL (a local build with no database) this
// writes nothing and the build goes on; with one, any failure stops the build, so a version never goes online over a
// database that lacks its tables or with a switch that does not say what the setting says.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import tls from 'node:tls'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) {
  console.log('[tofu-migrate] DATABASE_URL is not set: no database to set up, nothing written.')
  process.exit(0)
}

// node-postgres reads sslmode from the URL as full verification and lets it replace the ssl option, which fails
// against a managed database's pooler, so the ssl parameters come out of the URL and TLS is set here: verified
// against SUPABASE_CA_CERT (PEM text or base64) beside the system's roots when it is set, against the system's roots
// alone when the URL asks for TLS without it, and off for sslmode=disable or a URL that asks for nothing.
const target = new URL(url)
const sslmode = target.searchParams.get('sslmode')
for (const key of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat']) target.searchParams.delete(key)
const certificate = process.env.SUPABASE_CA_CERT
const ca = certificate
  ? certificate.includes('BEGIN CERTIFICATE')
    ? certificate
    : Buffer.from(certificate, 'base64').toString('utf8')
  : null
const ssl = ca
  ? { ca: [...tls.rootCertificates, ca], rejectUnauthorized: true }
  : sslmode && sslmode !== 'disable'
    ? { rejectUnauthorized: true }
    : false

const closed = process.env.NEXT_PUBLIC_DISABLE_SIGN_UP === 'true'
const directory = join(process.cwd(), 'supabase', 'migrations')
const files = readdirSync(directory)
  .filter((name) => /^\d+_.+\.sql$/.test(name))
  .sort()

// One build at a time decides what to apply: every transaction below takes this lock first. A transaction-level lock,
// because the pooler gives each transaction its own server session.
const LOCK = 'select pg_advisory_xact_lock(hashtext($1))'
const LOCK_KEY = 'tofu/migrate.mjs'

const client = new pg.Client({ connectionString: target.toString(), ssl })
await client.connect()
try {
  await client.query('begin')
  await client.query(LOCK, [LOCK_KEY])
  await client.query('create schema if not exists supabase_migrations')
  await client.query(
    'create table if not exists supabase_migrations.schema_migrations (version text not null primary key, statements text[], name text)'
  )
  await client.query('commit')

  let applied = 0
  for (const file of files) {
    const version = file.slice(0, file.indexOf('_'))
    const name = file.slice(file.indexOf('_') + 1, -'.sql'.length)
    const sql = readFileSync(join(directory, file), 'utf8')
    await client.query('begin')
    try {
      await client.query(LOCK, [LOCK_KEY])
      const done = await client.query('select 1 from supabase_migrations.schema_migrations where version = $1', [version])
      if (done.rowCount === 0) {
        await client.query(sql)
        await client.query('insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)', [
          version,
          name,
          [sql],
        ])
        applied += 1
        console.log(`[tofu-migrate] applied ${file}`)
      }
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => {})
      throw new Error(`${file}: ${error.message}`)
    }
  }
  console.log(`[tofu-migrate] ${applied} of ${files.length} migration files applied now; the rest were already applied.`)

  await client.query('begin')
  await client.query(LOCK, [LOCK_KEY])
  const written = await client.query(
    'update public.app_settings set sign_up_open = $1, updated_at = now() where id and sign_up_open is distinct from $1',
    [!closed]
  )
  const row = await client.query('select sign_up_open from public.app_settings where id')
  await client.query('commit')
  if (row.rowCount !== 1) throw new Error('public.app_settings has no row, so the sign-up switch cannot be written.')
  console.log(
    `[tofu-migrate] sign-up is ${row.rows[0].sign_up_open ? 'open' : 'closed'} (NEXT_PUBLIC_DISABLE_SIGN_UP=${closed ? 'true' : 'not true'}${written.rowCount ? ', changed now' : ''}).`
  )
} catch (error) {
  console.error(`[tofu-migrate] stopped: ${error.message}`)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
