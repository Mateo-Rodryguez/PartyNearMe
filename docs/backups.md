# Database backups

Every night at 03:17 UTC the **Back up database** workflow
(`.github/workflows/backup-database.yml`) dumps the Supabase database and stores it
in the private R2 bucket `partynearme-backups` as `daily/YYYY-MM-DD.tar.gz`. It keeps
the last 30 days and deletes older ones. Each file holds the three dumps Supabase's
restore guide uses: `roles.sql`, `schema.sql` and `data.sql`.

Photos are not in it: they already live in R2 (`partynearme-media`).

## One-time setup

GitHub only runs scheduled workflows from the repository's default branch, so
**PartyApp** has to be the default (GitHub **Settings > General > Default branch**).
Until then the workflow can still be started by hand.

1. In Cloudflare, go to **R2 > Create bucket**, name it `partynearme-backups` and
   leave public access off. (The media bucket has a public URL; backups must not.)
2. In **R2 > Manage API tokens**, create a token with **Object Read & Write** limited
   to `partynearme-backups`. Keep its Access Key ID and Secret Access Key private.
3. In GitHub, go to **Settings > Secrets and variables > Actions** and add:
   - `BACKUP_R2_ACCESS_KEY_ID`
   - `BACKUP_R2_SECRET_ACCESS_KEY`

   `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` are already there for the
   migrations workflow.
4. In **Actions > Back up database**, press **Run workflow** once and check that it goes
   green and a file appears in the bucket.

If a nightly run fails, GitHub emails the repository owner.

## Restoring

Only when data has been lost, and ideally into a new Supabase project first to
check it. Download a backup from the bucket, unpack it, and run with the target
database's **session pooler** connection string (Supabase dashboard, **Connect**):

```sh
tar xzf 2026-10-18.tar.gz
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql --file schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --dbname "postgresql://postgres.PROJECT_REF:PASSWORD@HOST:5432/postgres"
```

The password goes only in your own terminal, never in chat or in a file in the repo.
After restoring into a new project, point Render's `DATABASE_URL` at it.
