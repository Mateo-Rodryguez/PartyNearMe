# PartyNearMe: code analysis

> The old prototype now lives on the `main` branch; paths below refer to it.

Repo: https://github.com/Mateo-Rodryguez/PartyNearMe (public, single `main` branch, 23 commits, last commit 2025-04-11).
README pitch: "App to connect event organizers and guests."

## What the app is

A social feed for parties and events, shaped like Instagram. People sign up, post photos of an event with a caption and a location, get a personalised "For You" feed of other people's posts, and can direct-message each other.

## Stack

| Part | Tech | Folder |
|---|---|---|
| Android app | Kotlin, Jetpack Compose, Material 3, Navigation-Compose, Retrofit + Gson, OkHttp, Coil, CameraX, Play Services Location, Socket.IO Java client, Accompanist pager | `PartyNearMeAndroid/` |
| Main API (current) | Node.js + Express, PostgreSQL (`pg`), bcrypt, JWT, multer uploads, HTTPS with a self-signed cert, port 5000 | `db2/index.js` |
| Chat server | Node.js + Socket.IO over plain HTTP, port 3000 | `db2/socket.js` |
| Recommender | Python, long-running child process spawned by the API; scikit-learn TF-IDF + Hugging Face `facebook/bart-large-mnli` zero-shot classifier | `db2/interests_ML.py` (current), `db2/ml_recommender.py` (older TF-IDF-only version, unused) |
| Old backend (abandoned) | Express + MySQL, from the 2024 start | `myBackend/` |
| Misc | `envbackup.yml` is a full Anaconda base-env export (not project-specific) | root |

The app is built to run in the Android emulator: every URL is hard-coded to `10.0.2.2` (the emulator's alias for the host machine).

## Timeline (from git history)

- **May–June 2024:** Android skeleton, dummy posts, a first MySQL backend (`myBackend`).
- **Feb 2025:** real work restarts. Messages UI, Socket.IO chat, new-post screen with camera and location, posts uploaded and saved to Postgres, profile grid.
- **Late Feb 2025:** "For You" feed and the ML recommender working.
- **Mar–Apr 2025:** interests feature (zero-shot boosting), refresh button, bottom navigation. Last commit 2025-04-11.

## Features and how far each got

| Feature | State | Notes |
|---|---|---|
| Register / log in | Works | bcrypt-hashed passwords, JWT issued. Register doesn't save the user id, so a new user lands on the feed as user `-1` until they log in. |
| Create post (photos, caption, location) | Works | Gallery multi-pick (up to 10) or camera, "use current location" via reverse geocoding, multipart upload to `/posts`. |
| Profile | Partly | Shows your own posts in a 3-column grid. "Attended/Organised" counts are hard-coded to 0, profile picture is a placeholder, logout is broken (see below). |
| For You feed + recommendations | Works (core feature) | Server takes the latest 100 posts by others; Python scores them with TF-IDF similarity to posts you liked, plus a boost when the zero-shot classifier matches the caption to your interests; returns the top 5. Falls back to most-liked. |
| Interests filter | Works | Dialog with 10 fixed interests (music, sports, food…) saved to `user_interests`. |
| Likes | UI only | Heart icon does nothing; there is no like endpoint, though the recommender reads a `likes` table. |
| Direct messages | Half-built | Messages are sent over Socket.IO and saved to Postgres, but the sender never joins the room so nothing is received live, there's no history endpoint, and the inbox list calls an endpoint that doesn't exist. |
| Nearby users | Stub | Despite the name, it lists *all* users from `/users`; no distance logic exists on the server. |
| Events / organiser features | Not started | `EventPost`/`EventPostView` (music, videos, location button) are empty placeholders. Nothing models an event, RSVP or organiser yet, even though that's the pitch. |
| "Requests" button, search in inbox | Not started | Buttons with no behaviour. |

## Broken or risky things worth knowing

**Blocks running it today**
1. **The HTTPS certificate expired on 2024-10-25.** The app pins `res/raw/server.crt` (same as `db2/certs/certs2/server.crt`), so every API call from the app will now fail TLS until a new cert is generated and copied into both places.
2. **`db2/package.json` is missing most dependencies**: `pg`, `bcrypt`, `jsonwebtoken`, `dotenv` aren't listed (and aren't in the committed `node_modules`). A fresh `npm install` won't produce a runnable server.
3. **No database schema in the repo.** The code expects Postgres tables `users`, `posts`, `post_media`, `likes`, `messages`, `interests`, `user_interests` (and columns like `like_count`, `profile_picture`), but there's no SQL or migration. It would have to be reconstructed from the queries.
4. **No `.env` template.** Needs `DB_HOST/USER/PASSWORD/NAME/PORT`, `JWT_SECRET`, `PORT`. Note `socket.js` and `index.js` both read `PORT`, so setting it in `.env` would make them collide.
5. The ML process is spawned as `python interests_ML.py` relative to the working directory, so the API must be started from inside `db2/`, and the first run downloads the ~1.6 GB BART model.

**Bugs**
- **Logout doesn't log out**: user id is saved under prefs file `MyAppPrefs` but `clearUserIdFromPrefs` clears `PartyNearMePrefs` (`SharedPrefsHelper.kt`).
- **Chat room join is circular**: the client only emits `joinConversation` after receiving `conversationJoined`, which the server only sends after a join, so it never joins and never receives messages (`MessagesScreen.kt`). If it ever did start, it would loop.
- Incoming messages are parsed as `senderId`, but the DB row returns `sender_id`, so receiving would crash.
- New conversation ids are `MAX(conversation_id)+1` from `messages` and aren't stored until the first message, so two people starting chats at once can get the same id.
- Inbox items navigate to `messages/{conversation.id}` but that route expects the other *user's* id.
- Recommendations use `stdout.once` on a shared Python process, so two simultaneous requests can receive each other's results.
- Saving an empty interests list produces invalid SQL (`VALUES` with nothing after it) and a 500.
- Posts with no caption deserialize to `null` into a non-null Kotlin `String` and will crash the feed when rendered.
- Camera preview: the manifest doesn't declare `CAMERA` and the app never requests it, so the live preview stays black (the take-picture button uses the system camera and works).
- Media URLs are built server-side with the hard-coded `https://10.0.2.2:5000`.

**Security (fine for a local prototype, must change before real users)**
- The JWT is issued but **never checked**; every endpoint trusts the `userId` the client sends.
- `GET /users` returns every user **including `password_hash`**.
- The TLS **private key is committed** (`db2/certs/…/server.key`); it's a self-signed localhost cert so low impact, but it should be regenerated and removed from git.
- Uploads accept any file type, no size limit.
- `node_modules` folders are committed for both backends.

**Housekeeping**
- `build.gradle.kts` declares several libraries twice with conflicting versions (Material3 `1.3.0` and `1.0.0-alpha01`, navigation `2.7.7` and `2.4.0-alpha10`, CameraX `1.4.1` and `1.1.0`); Gradle picks the higher, but it's noise.
- `ApiService`/`AuthService` declare ~10 endpoints that don't exist on the server (message status, reactions, participants, nearby, `/userId`…).
- No real tests (only the Android template examples).
- `myBackend/` and `ml_recommender.py` are dead code.

## Server endpoints that actually exist (`db2/index.js`)

`POST /login`, `POST /users` (register), `GET /users`, `POST /conversations/find-or-create`, `POST /user/interests`, `POST /posts` (multipart, field `media`), `GET /user/posts?userId=&page=`, `POST /recommendations`, static `/uploads/posts/*`. Socket.IO events: `joinConversation`, `sendMessage` → `receiveMessage`.

## If you pick it back up, the shortest path to a running app

1. Regenerate the self-signed cert (SAN `10.0.2.2`) and copy it into the app.
2. Add the missing npm deps and a `.env.example`.
3. Write a `schema.sql` from the queries above.
4. Fix logout and the chat join, then add a like endpoint.
After that, the product gap is the "events" part itself: events with date/time/place, organisers, RSVPs and real nearby search.
