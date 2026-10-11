# PartyNearMe

App to connect event organizers and guests: find parties near you, RSVP, share photos, message people.

This branch is the relaunch for Android and iOS. The original university prototype is on the `main` branch.

## Layout

| Folder | What it is |
|---|---|
| `backend/` | API and background worker: Node + TypeScript, Fastify |
| `supabase/` | Database migrations (Postgres + PostGIS + pgvector) and database tests |
| `app/` | Kotlin Multiplatform app for Android and iOS (not started yet) |
| `docs/` | Relaunch plan, target architecture, cost estimate, analysis of the old code |

## Running the backend

Needs Node 22.

```sh
cd backend
cp .env.example .env      # then fill in DATABASE_URL
npm install
npm run dev               # http://localhost:3000/health
npm test                  # unit tests

# Integration tests against a real Postgres (see below for what it needs):
TEST_DATABASE_URL="$(../supabase/test-db.sh start)" npm run test:db
../supabase/test-db.sh stop
```

Every route except `/health` needs a Supabase access token (`Authorization: Bearer …`). The user id comes only from that verified token, and queries run as that user so the database's row-level security rules apply to the API too.

## Testing the database migrations

Needs PostgreSQL 16 with PostGIS and pgvector installed locally (CI installs them automatically).

```sh
./supabase/test-migrations.sh
```

This starts a throwaway Postgres, adds stand-ins for the parts of Supabase the schema relies on (`auth.users`, `auth.uid()`, the `authenticated` role), applies every migration and runs the row-level security tests in `supabase/tests/`.

## Secrets

Nothing secret goes in git. Copy `.env.example` to `.env` locally; in CI and hosting, set the same variables as secrets.

## Plan

See [docs/plan.md](docs/plan.md). Current milestone: 1, secure backend core.
