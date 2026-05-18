# Cell Journey — Agent Instructions

## Product Summary

Cell Journey is a church cell-group attendance app. It will be rebuilt as a mobile-first monorepo, starting with an Expo app for iOS/Android and Convex as the backend. A Next.js web/admin app will be added later.

The app serves church cell groups where members join groups, leaders manage their own group, events are scheduled, and attendance is tracked.

## Current Build Direction

- Build **mobile first**.
- Use **Expo** for the mobile app.
- Use **Convex** for backend/database/realtime functions.
- Use **Convex Auth** for authentication.
- Use **pnpm workspaces** for the monorepo.
- Do **not** initialize Expo or Next.js apps until explicitly requested.
- Next.js/web/admin comes later.

## Planned Monorepo Structure

```txt
cell-journey/
├── apps/
│   ├── mobile/        # Expo app, added first when requested
│   └── web/           # Next.js app, added later
├── packages/
│   ├── config/        # shared tsconfig/eslint/etc later
│   ├── domain/        # shared domain constants/types/validation later
│   └── ui/            # shared UI only if useful later
├── convex/            # Convex backend
├── AGENTS.md
├── package.json
└── pnpm-workspace.yaml
```

## MVP Roles and Domain Rules

- MVP supports **members** and **leaders** only.
- Admin dashboard comes later.
- One authenticated user has exactly **one role**: `member` or `leader`.
- One member belongs to exactly **one current group**.
- One leader leads exactly **one group**.
- Groups are created manually by the owner/developer in Convex for MVP.
- Leader assignment is manually configured in Convex for MVP.
- Historical records must remain intact when users leave or are removed from groups.

## Authentication

Use **Convex Auth** with:

- Google sign-in
- Apple sign-in
- Email OTP/code

Prefer email OTP/code over email magic links for mobile UX. Phone OTP is not planned for MVP because production SMS is not meaningfully free.

## Onboarding and Group Join Flow

Members join via the current mobile onboarding flow:

1. User signs in.
2. User completes required profile details: full name, services attending, Singapore region.
3. User enters a group code.
4. User confirms the matched group.
5. A pending join request is created.
6. Leader approves or rejects the request.
7. While pending, show a polished persistent pending approval state with group name/context.

If a member leaves a group or a leader removes/kicks them:

- User loses current membership.
- Historical attendance remains tied to old group/events.
- User returns to the group-code step of onboarding, with existing profile answers preserved.

## Onboarding/Profile Fields

Required for MVP:

- Full name
- Service(s) attending — multi-select
- Singapore region — required dropdown
  - North
  - South
  - East
  - West
  - Central
  - Northeast
  - Northwest
  - Southeast
  - Southwest
- Group code for member onboarding

Preferred name is not part of onboarding for now. It may be added later as an editable profile field.

Users may edit their own profile fields after onboarding except role/group membership.

## Events/Schedule

Use a simple calendar-style event model for MVP:

- Title
- Location
- Start date/time
- End date/time
- Owning group

Do not model explicit rest weeks for MVP. If no event exists, no meeting is scheduled.

Do not distinguish regular vs special events in MVP unless explicitly requested later.

Permissions:

- Leaders create/edit/delete events for their own group.
- Members view events for their group.

## Attendance

Attendance must be attached to a scheduled event.

Members can self-submit attendance only during this window:

- From **1 hour before event start**
- Until **1 hour after event end**

Leaders can mark/confirm/override attendance for members in their group.

Attendance should be modeled flexibly so member self-marking can be disabled later without schema surgery.

Recommended concept:

- Member self-check-in creates/submits attendance.
- Leader may confirm, override, or correct it.
- Leader authority remains final.

Attendance rate for MVP:

```txt
present attendance ÷ total past events during active membership period
```

Present includes:

- leader-confirmed/leader-marked present
- member self-marked present unless overridden/rejected by leader

## Leader MVP Features

Leader mobile app must support:

- View own group dashboard
- Create/edit/delete events
- Mark group attendance for events
- Confirm/override member self-attendance
- Approve/reject join requests
- View member list
- Remove/kick members
- View basic member attendance summaries

## Member MVP Features

Member mobile app must support:

- Complete onboarding
- Join group by code
- See pending approval state
- View group schedule/events
- Self-submit attendance during allowed event window
- View personal attendance rate/history
- Edit own profile fields except role/group
- Leave current group

## Mobile App UX Decisions

Use Expo with:

- Expo Router for navigation
- Plain React Native `StyleSheet`
- A small local design-token system for colors, spacing, typography, radius, etc.
- Native-feeling UI over web/Tailwind-style UI

Initial approved-user tabs:

- Member: Home, Schedule, Attendance, Profile
- Leader: Home, Attendance, Schedule, Members, Profile

## Notifications

Push notifications are in MVP:

- Notify leaders when join requests are submitted.
- Notify members about upcoming events.

Use online-first behavior. No offline write queue for MVP. Provide clear loading, error, and retry states.

## Backend Rules

- Use Convex queries/mutations for all data access.
- No REST API unless explicitly required by integrations.
- Keep authorization checks in Convex functions.
- Read Convex generated AI guidelines before working on Convex code if present:
  - `convex/_generated/ai/guidelines.md`

## Code Style Preferences

- Keep components small and composable.
- Prefer explicit domain modeling over clever abstractions.
- Avoid premature shared packages; add shared packages when duplication appears.
- Keep mobile app native-feeling and polished.
- Be willing to wipe/rebuild old code when scope changes.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
