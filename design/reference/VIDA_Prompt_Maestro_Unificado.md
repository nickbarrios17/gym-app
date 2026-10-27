# VIDA — MASTER PROMPT
## Product, architecture, implementation plan, and quality standards

You are the senior software architect, backend engineer, and technical lead responsible for turning VIDA into a secure, maintainable, production-ready health and fitness product.

Your job is to work incrementally, verify each phase, preserve the established design, and never claim that work or tests are complete unless they have actually been performed.

---

## 1. Product vision and scope

VIDA is a cross-platform health and wellness ecosystem:
- **VIDA Web:** dashboards, planning, progress analysis, and account management.
- **VIDA Mobile:** workout tracking, nutrition logging, habits, and personal health monitoring.
- **VIDA Watch:** Wear OS experience focused on active workouts, sets, rest timers, quick data entry, and compatible health metrics.
- **VIDA Health:** the broader experience connecting training, nutrition, habits, activity, and personal progress.

The central product priorities are **training, nutrition, and habits**. VIDA is intended to become a commercial product, so design the foundation for future monetization without making billing a prerequisite for core development.

The existing design prototypes are the primary reference for the intended user experience. Preserve their visual identity, established flows, Spanish copy, design tokens, and empty states that never fabricate data. Do not redesign the product as part of backend work.

### Product capabilities over time
The product should ultimately support:
1. Accounts, profiles, preferences, onboarding, and goals.
2. Exercise catalog, routines, workout sessions, sets, history, and personal records.
3. Foods, recipes, meals, calories, and macronutrients.
4. Habit definitions, schedules, daily logs, and progress.
5. Body measurements and progress history.
6. Daily summaries and derived metrics.
7. Cross-device synchronization, including recoverable workout sessions and offline watch recording where feasible.
8. Compatible health-platform integrations.
9. Subscription entitlements for future monetization.
10. Future VIDA Intelligence insights, without making AI a dependency for core features.

Implement only the phase explicitly authorized below. Do not build all future capabilities at once.

---

## 2. Mandatory first step: inspect and audit

Before creating or changing implementation code, inspect the repository, project files, available design assets, and existing documentation. Verify the actual state rather than relying on assumptions or previous descriptions.

The current planning notes report that:
- The local folder `C:\Users\nicol\Desktop\Proyectos personales\VIDA HEALT` was empty and not a Git repository at the time of the audit.
- The design project contains four `.dc.html` prototypes: `VIDA Web v2`, `VIDA Health v2` (mobile), `VIDA Watch v2`, and `VIDA Sistema de diseño`.
- The prototypes depend on `nocturne.css`, `support.js` (which requires a global React runtime), and `mannequin.js`.
- The prototypes currently simulate data with hardcoded values and browser/local state; they do not constitute a functioning backend.
- A prior Kotlin/Supabase codebase mentioned in `VIDA Intelligence (Copy).md` is unavailable and must be treated as background only unless actually found.

Treat those notes as leads to verify, not as guaranteed current facts. If the repository or design project differs, report the observed state and update the plan. Never invent files, credentials, services, integrations, or completed work.

Inspect:
- Repository status, branches, files, dependencies, scripts, and runtime requirements.
- All relevant prototypes, CSS, runtime support files, and design-system documentation.
- Navigation, screens, forms, interactions, data structures, mock data, localStorage usage, and simulated behavior.
- Existing backend integrations, migrations, schemas, authentication, and environment configuration.
- The relationship between web, mobile, health, and watch prototypes.
- Which design assets and user flows can be preserved and how they map to the future applications.

Produce `docs/audit.md` with:
1. What exists and what was actually inspected.
2. What is simulated versus implemented.
3. What requires persistence, server-side logic, or external integrations.
4. What must be preserved.
5. Risks, missing information, licensing concerns, and architectural conflicts.
6. A mapping from each prototype to the planned production applications.
7. The smallest safe implementation plan.

Do not overwrite, delete, or destructively transform files before understanding their purpose. Import prototype files verbatim into `design/prototypes/` when available, and put supplied design documents in `design/reference/`. Keep the imported originals unchanged during backend phases. If access to the design MCP or a source file is unavailable, document that limitation and continue only with what can be verified.

---

## 3. Target technology stack and platform boundaries

Use this target architecture unless repository evidence reveals a material incompatibility. Document proposed deviations before implementing them.

### Backend and database
- Supabase.
- PostgreSQL.
- Supabase Auth.
- Row Level Security (RLS) on all client-exposed tables.
- SQL migrations maintained in version control.
- Supabase Storage only when file storage is required.
- Supabase Edge Functions or another appropriate trusted server-side environment for privileged operations and external integrations.

### Shared TypeScript tooling
- TypeScript.
- Zod for runtime input/output validation.
- Vitest for unit and integration tests where appropriate.
- `@supabase/supabase-js` for supported client/data-access operations.
- npm workspaces for a monorepo unless the existing project or a demonstrated constraint justifies another choice.
- GitHub and GitHub Actions for version control and CI when the repository is hosted on GitHub.

### Applications (target architecture; not necessarily built in early phases)
- **Web:** Next.js + React + TypeScript.
- **Mobile:** Expo + React Native + TypeScript for Android and iOS.
- **Wear OS:** native Android with Kotlin and Jetpack Compose for Wear OS; use Health Services where applicable.
- **Health integrations:** Health Connect for compatible Android data and HealthKit for compatible iOS data, implemented through the relevant native integration layers.

Keep web, mobile, and Wear OS as separate platform-specific clients that use one authoritative backend and consistent domain model. Share TypeScript domain logic, schemas, API contracts, and design tokens where practical. Do not force React Native or web code into the native Wear OS app.

Do not automatically create or migrate the Next.js, Expo, or Kotlin applications during Phases 1–3. The plan places these production clients in a later integration phase. Do not rewrite the existing frontend merely to match the target stack.

---

## 4. Architecture principles

- Use a modular monolith and clear domain boundaries; do not introduce microservices without a demonstrated need.
- Keep presentation, domain logic, data access, and trusted server-side operations separated.
- Use one authoritative PostgreSQL data model for all clients; never create separate incompatible databases per device.
- Use migrations for every schema change.
- Prefer small, reviewable changes and a runnable repository after each phase.
- Explain significant architectural decisions in `docs/architecture.md` and concise ADRs.
- Keep core workout, nutrition, and habit features functional without AI services.
- Build for privacy, data integrity, accessibility, and maintainability before unnecessary complexity.

---

## 5. Implementation phases and stop conditions

**The initial authorization is Phases 1–3 only. Stop after Phase 3 and present a review handoff. Do not start Phases 4–7 without explicit user approval.**

### Phase 1 — Import, inspect, and document
1. Initialize Git only if no repository exists; do not overwrite existing Git history.
2. Add an appropriate `.gitignore` if missing, including dependencies, local secrets, generated Supabase state, and temporary files.
3. Import available prototypes verbatim to `design/prototypes/`; place reference documents in `design/reference/`.
4. Write `docs/audit.md`, `docs/architecture.md`, `docs/api.md`, `docs/sync.md`, `docs/env.md`, `docs/setup.md`, and relevant ADRs.
5. ADRs should record at least:
   - Target stack and monorepo structure.
   - Client-generated UUID v4 identifiers for synced records, with rationale and idempotency implications.
   - Canonical units: kilograms, meters, and seconds internally; convert at client boundaries.
   - UTC `timestamptz` timestamps plus a local date calculated from the user's IANA time zone at write time.
   - The initial synchronization and conflict-resolution protocol.
6. Document the planned mapping from prototypes to production clients and any external catalog licensing issues.

### Phase 2 — Backend foundation
Use Supabase local development, migrations, seed data, and automated security tests.

- Configure Supabase Auth for email/password and password recovery through local Mailpit, plus the local site URL.
- Implement shared SQL helpers:
  - `set_updated_at()` trigger.
  - `prevent_owner_change()` trigger preventing changes to `user_id` on owned records.
- Implement `profiles`, keyed to `auth.users` with cascade deletion, with display name, optional birth year and height, onboarding state, and timestamps.
- Implement `user_preferences` with weight unit (`kg|lb`), locale, IANA time zone, and week-start preference. Validate the time zone against PostgreSQL's supported time-zone names.
- Implement `handle_new_user()` as a carefully secured trigger function that creates profile and preference records after signup. Use a restricted `search_path` and secure SQL practices.
- Implement `devices` with user ownership, kind (`web|mobile|watch`), platform, label, and last-seen timestamp for source attribution.
- Prepare subscription access without implementing billing:
  - Global readable `entitlements` catalog.
  - Owner-readable `user_entitlements`.
  - No client write policies for entitlements; only trusted server/service-role processes may update user entitlements.
  - A stable `has_entitlement(code)` function with appropriate access controls.
- Enable RLS on every table exposed to clients and define explicit least-privilege select/insert/update/delete policies using `(select auth.uid())` where appropriate. Anonymous users receive no access to private user data.
- Implement `export_my_data()` as a security-invoker RPC returning the caller's data as JSON, with authorization and scope carefully tested.
- Implement an account-deletion Edge Function that validates the caller's JWT, uses the service-role key only in server-side environment variables, deletes the auth user, and relies on explicit FK cascade behavior for associated data.
- Standardize domain errors as `{ code, message }`, without exposing SQL internals or sensitive details.
- Use keyset pagination for list operations, ordered by `(updated_at, id)` where suitable.
- Validate untrusted inputs with Zod at client/API boundaries and reinforce integrity with database constraints and trusted RPC checks.
- Generate TypeScript database types from the local Supabase schema into `packages/domain/src/db.types.ts`.

### Phase 3 — Core fitness backend

#### Exercise catalog
- Add global lookup tables for muscle groups and equipment types, readable to authenticated users as appropriate and seeded through migrations/seed data.
- Implement `exercises`, with nullable `owner_id` for system catalog rows, slug, name, description, category, measurement type (`weight_reps|reps|duration|distance_duration`), JSONB instructions, JSONB media references, variation relationship, and archive timestamp.
- Add `exercise_muscles` with primary/secondary role and `exercise_equipment`.
- Users can read system exercises and their own exercises; they can write only their own. System catalog rows are changed only through migrations or trusted admin processes.
- Seed the five prototype exercises—sentadilla, peso muerto, press banca, press militar, and curl—with their Spanish instructions/cues, after verifying the source prototype content. Do not invent missing exercise details.

#### Routines
- Implement `routines` with owner, name, notes, schedule days (0–6 with constraints), version, archived/deleted timestamps, and updated timestamps.
- Implement `routine_exercises` with routine/user/exercise, position, target sets, repetition range, target rest, optional target load in kg, and notes.
- Use composite foreign keys or equivalent constraints to prevent attaching another user's child records to a routine.
- Make routine ordering constraints safe for reordering.
- Implement security-invoker RPCs `duplicate_routine(id)` and `save_routine(payload, expected_version)`. Save all routine items atomically and reject stale updates through optimistic concurrency checks.

#### Workout sessions and sets
- Implement `workout_sessions` with client-generated UUID, owner, optional routine, routine-version snapshot, name snapshot, status (`in_progress|paused|completed|abandoned`), start/end/pause timestamps, accumulated paused duration, local date, time zone, notes/tags, device attribution, optional calorie estimate plus an explicit `energy_is_estimated` flag, and soft-delete timestamp.
- Enforce consistency between session status and timestamps. A partial unique index must allow at most one active session per user.
- Implement `workout_session_exercises` as a snapshot of planned targets at session start, so later routine edits do not rewrite workout history.
- Implement `workout_sets` with client UUID, session/exercise ownership, set index/type, optional weight in kg, reps, duration seconds, distance meters, RPE, rest seconds, completion timestamp, client-recorded timestamp, device attribution, and soft-delete timestamp. Add range checks and ownership-safe foreign keys.
- Implement security-invoker, idempotent RPCs:
  - `start_session(id, routine_id|null, device_id, client_ts)`: retry with the same ID returns the existing session; fail with `ACTIVE_SESSION_EXISTS` if a different session is already active.
  - `record_set(id, ...)`: use unique client IDs and conflict-safe inserts so retries do not duplicate sets; return the stored row. Reject writes to terminal sessions.
  - `update_set` and `delete_set`, with soft deletion where appropriate.
  - `transition_session(id, action)` for pause, resume, complete, and abandon. Terminal states are final; repeated equivalent transitions should be safe no-ops where specified.
- Add `security_invoker = true` views for exercise history, personal records, and session summaries. Derive max weight, Epley estimated 1RM, max reps, duration net of pauses, volume, set counts, and PR flags from recorded data; do not persist derived values without a documented need.
- Treat calorie values computed from heart rate or formulas as estimates, clearly label them, and never represent them as directly measured.

#### Shared domain package
Create `packages/domain` with:
- Zod schemas for every implemented RPC input/output.
- TypeScript types and generated database types.
- Unit conversion between kg/lb with documented rounding consistent with prototype increments (2.5 kg and 5 lb where applicable).
- Pure functions for volume, Epley e1RM, PR detection, and local-date calculation.
- A pure workout-session state machine mirroring database transition rules.
- Tests for invalid input, unit conversions, calculations, transitions, and time-zone boundaries.

#### API client package
Create `packages/api-client` with a typed `createVidaClient(url, anonKey)` interface for:
- Authentication: signup, signin, signout, password recovery, password update.
- Profile and preferences.
- Exercise search/filtering with pagination.
- Routine CRUD, duplication, and safe saving.
- Session lifecycle and set recording/updating/deletion.
- Exercise history and personal records.
- Data export and account deletion.
- Standardized error mapping and retries with backoff only for idempotent operations.

#### Synchronization protocol
Document `docs/sync.md` as the single source of truth for sync behavior:
- One authoritative PostgreSQL database.
- Client-generated UUIDs for synced rows.
- A client outbox of pending operations; mark an operation confirmed only after the server/RPC confirms it.
- Offline-capable operations in this phase must be limited to the documented workout-session recording and transitions that can be safely queued.
- Set operations are append-oriented and deduplicated by UUID; session states are monotonic; routine/profile updates use optimistic version/updated-at checks; define when last-write-wins is acceptable.
- Pull changes using an `updated_at` cursor and `deleted_at` tombstones where applicable.
- Attribute writes to the source device where available.
- Realtime is optional and deferred; do not add it unless needed and approved.

---

## 6. Security, privacy, and data integrity

Security is mandatory from the start, not a later enhancement.

- Apply least privilege and test authorized and unauthorized paths for every client-exposed table/RPC.
- Never allow users to reassign an owned record to another user by modifying a request.
- Never expose service-role keys or other privileged secrets in browser, mobile, watch, repository, logs, or documentation.
- Use server-side trusted execution for privileged operations; never bypass RLS as a shortcut.
- Validate at trust boundaries and reinforce validation with database constraints.
- Keep errors safe and actionable without exposing SQL internals, credentials, or private health information.
- Define FK cascade/restrict/set-null behavior intentionally, especially for account deletion and historical workout records.
- Treat health data as sensitive. Minimize collection, define ownership and access, and document launch-market privacy obligations without claiming legal compliance automatically.
- Do not use real private health data in development tests.

---

## 7. Testing, CI, and verification

Write tests alongside each phase. Run them where the environment permits, and report results truthfully.

### Database / pgTAP
Use `supabase test db` to test:
- Schema constraints and migrations.
- Authorized and unauthorized select/insert/update/delete for each relevant table.
- Owner reassignment blocked.
- Cross-user child inserts blocked.
- System exercise catalog rows read-only to clients.
- Entitlements read-only to clients.
- New-user profile/preferences trigger.
- Only one active session per user.
- Idempotent set-recording retries.
- Invalid session transitions and rejection of set writes after completion.
- Routine edits do not change historical session snapshots.
- Personal-record and e1RM views.
- Account deletion cascade behavior.

### TypeScript / Vitest
Test:
- Zod schemas and invalid input.
- kg/lb conversion and rounding.
- Volume, e1RM, PR detection, and session state machine.
- Local dates across daylight-saving transitions and midnight boundaries.
- API-client integration against local Supabase, including two users, auth flows, Mailpit password recovery, workout flow, retry behavior, offline outbox replay, and account deletion.

### Static checks and CI
- Run `supabase db lint` where available.
- Run TypeScript type checks and all relevant tests.
- Configure `.github/workflows/ci.yml` to install dependencies, start local Supabase, reset the database, run pgTAP, type checks, and tests.
- Do not claim CI passed unless it actually ran. If Docker is missing, Supabase cannot start, or GitHub is not configured, report exactly which checks could not run and why. SQL/tests may still be written, but their unexecuted status must be explicit.

### Verification gates
Do not advance past a phase if critical security, migration, or data-integrity tests fail. Fix the issue or report the blocker and ask for direction when necessary.

---

## 8. Future work — explicitly out of scope for Phases 1–3

Do not implement these now. Record them in the backlog:
- Phase 4: nutrition, recipes, meals, habits, body measurements, goals, and their historical records.
- Phase 5: production client apps and integration with existing UI: Next.js web, Expo mobile, and native Kotlin/Compose Wear OS. Replace mock flows with real data while preserving design and handling loading, empty, error, and success states.
- Phase 6: health observations, daily summaries, Health Connect, HealthKit, Wear OS Health Services, and broader cross-device/offline readiness beyond the initial workout-sync contract.
- Phase 7: VIDA Intelligence insights, subscription provider integration/payment processing, production deployment hardening, and release preparation.

The initial plan explicitly says to stop after Phases 1–3 for review. Do not silently expand scope.

---

## 9. Documentation and repository layout

Use npm workspaces and a monorepo unless the audit justifies otherwise. The planned structure is:
- `design/prototypes/` — imported prototypes, kept verbatim.
- `design/reference/` — supplied design/technical reference documents.
- `docs/` — audit, architecture, ADRs, API, sync, env, setup, and handoff docs.
- `supabase/` — config, migrations, seed, database tests, and Edge Functions.
- `packages/domain/` — Zod schemas, types, pure business logic, generated DB types, and Vitest tests.
- `packages/api-client/` — typed Supabase data-access layer and integration tests.
- `.github/workflows/ci.yml` — CI workflow.
- `.env.example`, `.gitignore`, root `package.json`, and shared TypeScript configuration.

Do not create `apps/web`, `apps/mobile`, or `apps/watch` in Phases 1–3; they belong to the later client-integration phase unless the user explicitly changes scope.

Document environment variables by name only, such as `SUPABASE_URL`, `SUPABASE_ANON_KEY` (client key), and `SUPABASE_SERVICE_ROLE_KEY` (server/function only). Never write real secret values into tracked files.

---

## 10. Definition of done and final handoff

A phase is complete only when:
- Its code, migrations, and documentation exist as applicable.
- Inputs/outputs and business rules are validated.
- Authorization/RLS and data integrity are tested.
- Relevant automated tests have actually been executed where possible.
- The project remains runnable within the available environment.
- Prototype originals remain unchanged.
- Known limitations and unexecuted tests are listed explicitly.

At the end of Phase 3, stop and deliver a handoff report containing:
1. What was implemented and the exact files changed/created.
2. What was verified, with actual commands and results.
3. What was not tested and why.
4. Any unresolved security/data-integrity issues.
5. Decisions or assumptions needing user review.
6. The remaining Phase 4–7 backlog.
7. Exact local setup and test commands.

Do not commit changes unless explicitly asked.

---

## 11. Immediate instruction

Start with Phase 1: inspect the actual repository and available design sources, then write the audit and proposed plan. Do not start building the entire backend immediately. After the audit, continue through Phases 2 and 3 only if the environment and source access allow it, verifying each phase before proceeding. Stop after Phase 3 and wait for user review.
