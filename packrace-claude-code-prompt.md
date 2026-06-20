# PackRace — Claude Code Build Prompt

Build a full Next.js 15 web app called **PackRace**. It is a competitive running handicap app for a group of friends (6–15 people). The app connects to Strava, analyses training data, predicts race times, assigns handicaps, and generates aggressive AI trash-talk commentary in the lead-up to a race. It is **mobile-first** and deployed on **Vercel** with **Neon Postgres**.

---

## Tech Stack

- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS** — dark theme, mobile-first
- **Prisma** — ORM with Neon Postgres (`DATABASE_URL` + `DIRECT_URL`)
- **Strava OAuth** — custom implementation (no next-auth), JWT stored in HTTP-only cookie via `jose`
- **Anthropic SDK** (`@anthropic-ai/sdk`) — claude-haiku for commentary generation
- **Vercel** for hosting + cron jobs

---

## Database Schema (Prisma)

```prisma
model User {
  id           String   @id @default(cuid())
  stravaId     String   @unique
  name         String
  firstName    String
  lastName     String
  profilePic   String?
  city         String?
  country      String?
  accessToken  String
  refreshToken String
  tokenExpiry  DateTime
  createdAt    DateTime @default(now())

  participations EventParticipant[]
  activities     Activity[]
}

model Event {
  id          String   @id @default(cuid())
  name        String
  description String?
  distanceKm  Float
  date        DateTime
  location    String?
  inviteCode  String   @unique @default(cuid())
  createdAt   DateTime @default(now())

  participants    EventParticipant[]
  groupCommentary GroupCommentary[]
}

model EventParticipant {
  id                 String    @id @default(cuid())
  eventId            String
  userId             String
  predictedTimeSecs  Int?
  manualPrediction   Boolean   @default(false)
  predictionLockedAt DateTime?
  actualTimeSecs     Int?
  stravaActivityId   BigInt?
  joinedAt           DateTime  @default(now())

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([eventId, userId])
}

model Activity {
  id              String   @id @default(cuid())
  stravaId        BigInt   @unique
  userId          String
  name            String
  type            String
  distanceMeters  Float
  movingTimeSecs  Int
  elapsedTimeSecs Int
  totalElevation  Float    @default(0)
  averageSpeed    Float
  maxSpeed        Float    @default(0)
  startDate       DateTime

  bestEfforts BestEffort[]
  user        User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model BestEffort {
  id             String   @id @default(cuid())
  activityId     String
  distanceMeters Int
  timeSecs       Int
  date           DateTime

  activity Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)

  @@index([distanceMeters, timeSecs])
}

model GroupCommentary {
  id          String   @id @default(cuid())
  eventId     String
  content     String   @db.Text
  generatedAt DateTime @default(now())

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
}
```

---

## Core Features & Business Logic

### 1. Authentication — Strava OAuth

- `GET /auth/strava?invite=[code]` — redirects to Strava OAuth. Pass invite code in `state` param.
- `GET /auth/callback` — exchanges code for tokens, upserts User, kicks off background activity sync, sets JWT cookie. If `state` contains a valid event invite code, auto-joins that event and redirects to `/events/[id]`. Otherwise redirects to `/events`.
- JWT stored in HTTP-only cookie (`packrace_session`), signed with `JWT_SECRET`, 30-day expiry, using `jose`.
- `GET /auth/logout` — clears cookie, redirects to `/`.

### 2. Strava Activity Sync

- On first login, sync the last **90 days** of running activities (types: `Run`, `VirtualRun`, `TrailRun`).
- For each activity, fetch the detailed endpoint (`include_all_efforts=true`) to get `best_efforts`.
- Store best efforts mapped to standard distances (400m, 1km, 1 mile, 5km, 10km, half, marathon).
- Token refresh: before any Strava API call, check if `tokenExpiry` is within 60 seconds and refresh if needed. Persist new tokens.
- `POST /api/sync` — manually re-sync the current user's activities (called from profile page).

### 3. Strava Webhook

- `GET /api/webhook` — Strava webhook verification (echoes `hub.challenge`).
- `POST /api/webhook` — handles incoming webhook events. When `object_type === "activity"` and `aspect_type === "create"`:
  1. Find the user by `owner_id` (Strava athlete ID).
  2. Fetch and store the new activity + best efforts.
  3. Trigger commentary regeneration for any upcoming events that user is in (race date in the future).
  4. Verify using `STRAVA_VERIFY_TOKEN` env var.

### 4. Race Time Prediction

Use **Riegel's formula**: `T2 = T1 × (D2 / D1) ^ 1.06`

- Use activities from the last **90 days** only.
- For each activity, use stored `BestEffort` records as data points. Also use the overall activity pace for runs between 50%–200% of target distance.
- Apply **exponential decay weighting** by recency: `weight = e^(-daysDiff / 30)`. Activity 30 days ago = 50% weight, 60 days = 25%.
- Only use best efforts where the source distance is between 10%–500% of the target race distance (avoids absurd extrapolations).
- From all weighted candidates, compute a **weighted median** predicted time (more robust than mean against outlier efforts).
- Store the result in `EventParticipant.predictedTimeSecs`.

### 5. Handicap & Scoring

- Handicap = `maxPredicted - userPredicted` for display purposes (shows how many seconds "ahead" of slowest they're predicted to finish).
- **Winner = most seconds saved vs their prediction**: `score = predictedTimeSecs - actualTimeSecs`. Higher = better.
- Predictions **lock 48 hours before race day**. After lock, attempting to update returns a 403.
- If a user manually overrides their AI prediction, set `manualPrediction = true`. Display a 🚩 next to their time in the UI so the group can see.

### 6. Race Result Auto-Detection

After race day, when a user syncs (or via webhook), attempt to auto-detect their race activity:
- Activity date within ±1 day of the event date.
- Activity distance within **±10%** of the event's `distanceKm`.
- If matched, populate `EventParticipant.actualTimeSecs` and `stravaActivityId`.
- User can also manually enter their finish time via the event page (overrides auto-detected).

### 7. Training Leaderboard

Stats computed over **last 8 weeks**, running activities only:

| Stat | Description |
|------|-------------|
| Most Runs | Total run count |
| Most KM | Total distance |
| Longest Run | Single longest run |
| Fastest KM | Best average pace across runs ≥1km (display as min:sec/km) |
| Most Elevation | Total elevation gain (metres) |
| Weekly Trend | Avg km/week last 4 weeks vs previous 4 weeks (shows ▲/▼) |

Show as swipeable stat cards on the event page, one category per card with ranked list.

### 8. AI Commentary

- **Trigger 1 — Daily**: A Vercel cron job runs daily at 07:00 UTC. For every event with race date in the future (and at least 2 participants), generate and store a new `GroupCommentary`.
- **Trigger 2 — Webhook**: When a new activity is synced via webhook, also regenerate commentary for affected upcoming events.
- **Content**: One group narrative (not per-athlete cards). Aggressive, savage, bullish trash talk. Call out slackers by name. Predict who will embarrass themselves. The closer to race day, the more intense.
- **Prompt tone**: "You are a savage sports pundit. Be specific about the data. Destroy people who haven't run. No bullet points. 3–5 punchy paragraphs."
- Use `claude-haiku-4-5-20251001` model, max 600 tokens.
- Display the **most recent** commentary on the event page. Show timestamp ("Generated 3 hours ago").

---

## Pages & UI

### Design System
- **Dark theme**: background `#0D0D0D`, cards `#1A1A2E`, borders `#2A2A4A`
- **Accent**: orange `#FF6B35` for CTAs, highlights, and positive stats
- **Red** `#E63946` for warnings, locked predictions, negative trends
- **Mobile-first**: max-width `430px`, everything stacks vertically, large tap targets
- Fun, energetic feel — not corporate. Use emojis where appropriate.

### `/` — Landing / Login
- App name + tagline ("Run together. Win alone.")
- "Connect with Strava" button (orange, large) → `/auth/strava`
- If already logged in, redirect to `/events`

### `/events` — Events List
- List of events the user is participating in, ordered by date
- Each card: event name, date, distance, location, participant count, days until race countdown
- FAB (floating action button) → create new event
- Empty state: invite someone / create first event

### `/events/new` — Create Event
- Form: Event name, Distance (km), Date, Location (optional), Description (optional)
- On submit: `POST /api/events`, redirect to new event page
- Show the shareable invite link immediately after creation

### `/events/[id]` — Event Detail (main page)
This is the heart of the app. Tabs or sections:

**1. Overview**
- Event name, date, distance, location, days until race
- Shareable invite link with copy button
- Participant avatars

**2. Handicaps**
- Table/cards: each participant, their predicted time, handicap vs slowest, manual flag 🚩
- "Your prediction" card with edit button (disabled if locked, shows lock icon + "Locked 48h before race")
- After race: show actual times and final scores (seconds saved). Winner highlighted.
- Auto-detect status: "We found your race activity on Strava ✓" or "Enter your time manually"

**3. Leaderboard** (training stats)
- Swipeable category tabs: Most KM / Most Runs / Fastest KM / Longest Run / Most Elevation / Trending Up
- Ranked list for each with avatars and values
- 8-week window badge

**4. Commentary**
- Latest group commentary displayed as a styled "press release" block
- Timestamp: "Updated X hours ago"
- Pull-to-refresh or a refresh button to manually trigger new commentary

### `/profile` — User Profile
- Strava profile pic, name, city/country
- Stats: total runs synced, total km
- "Re-sync Strava activities" button → `POST /api/sync`
- "Log out" button

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/auth/strava` | Start Strava OAuth |
| GET | `/auth/callback` | OAuth callback |
| GET | `/auth/logout` | Clear session |
| GET | `/api/events` | List user's events |
| POST | `/api/events` | Create event |
| GET | `/api/events/[id]` | Event detail |
| PATCH | `/api/events/[id]` | Update predicted/actual time |
| POST | `/api/events/[id]/join` | Join event |
| POST | `/api/sync` | Re-sync current user's activities |
| GET | `/api/webhook` | Strava webhook verification |
| POST | `/api/webhook` | Strava webhook handler |
| POST | `/api/events/[id]/commentary` | Manually trigger commentary regen |
| GET | `/api/events/join/[inviteCode]` | Resolve invite code → redirect |

---

## Environment Variables

```env
# Strava
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_VERIFY_TOKEN=         # any random string for webhook verification

# Database (Neon)
DATABASE_URL=                # pooled connection
DIRECT_URL=                  # direct connection (for Prisma migrations)

# Auth
JWT_SECRET=                  # random 32+ char string

# Anthropic
ANTHROPIC_API_KEY=

# App
NEXT_PUBLIC_BASE_URL=        # e.g. https://packrace.vercel.app
```

---

## Vercel Cron Job

In `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/commentary",
      "schedule": "0 7 * * *"
    }
  ]
}
```

`/api/cron/commentary` — finds all upcoming events (race date > now, ≥ 2 participants), generates group commentary for each, saves to `GroupCommentary`. Secured with `CRON_SECRET` header check.

---

## Key Implementation Notes

1. **Never block on activity sync** — always run in background (`syncUserActivities().catch(console.error)`). First load should feel instant.
2. **Prediction recalculation** — recalculate predictions on every sync if not yet locked. On the event page, show "Calculating..." if no prediction yet.
3. **Invite flow** — invite link is `${BASE_URL}/join/[inviteCode]`. If logged in, join immediately. If not logged in, redirect to `/auth/strava?invite=[code]` so they connect Strava and auto-join in one flow.
4. **Time formatting** — always display race times as `m:ss` for under an hour, `h:mm:ss` for over. Paces as `m:ss/km`.
5. **Handicap display** — show as `+0:00` (they start level) for the slowest person, and e.g. `+2:34` for faster people.
6. **Error states** — if Strava sync fails (token expired, rate limit), show a non-blocking toast, not a page crash.
7. **Loading skeletons** — use skeleton loaders on the event page for commentary and leaderboard sections (they may load slower).
```
