# Cell Journey

Church cell group attendance tracking PWA.

## Tech Stack

- **Framework**: Next.js (App Router)
- **Backend/DB**: Convex
- **Auth**: Convex Auth (Google + Facebook social login)
- **Package manager**: pnpm
- **Styling**: Tailwind CSS
- **Deployment**: PWA (mobile-first for members/leaders, desktop for admin)

## Project Context

Cell Journey is a church attendance app serving ~50 cell groups with 10–40 members each. Three user roles with different experiences:

- **Member** — mobile PWA, 3 bottom tabs (Home, Schedule, Profile). Can view upcoming meetings, personal attendance rate, and schedule.
- **Leader** — mobile PWA, 4 bottom tabs (Home, Attendance, Schedule, Members). Marks attendance (present/absent), creates meetings with role assignments (Word/Worship), manages group members, approves join requests. Can lead multiple groups.
- **Admin** — desktop sidebar layout. Oversees all groups, configures membership thresholds (active/inactive/no longer), views X/Y service ratio, exports data to Excel/CSV.

## Key Domain Rules

- One member belongs to one cell group at a time
- One leader can manage multiple cell groups
- Members join freely; leader approval required
- Attendance is marked by leaders only (not self-reported)
- Statuses: present or absent only
- Two event types: regular cell meetings and special events
- Meetings have date, time, venue, and role assignments (Word, Worship)
- Rest weeks (no meeting) are explicitly scheduled
- "Which service attending" is a one-time profile field per member
- Admin defines membership status thresholds (e.g. >50% = active)

## Commands

- `pnpm dev` — start dev server
- `pnpm build` — production build
- `pnpm lint` — run linter
- `pnpm dlx convex dev` — start Convex dev server

## Route Structure

```
src/app/
├── (auth)/
│   └── sign-in/page.tsx       ← auth page (unauthenticated users redirected here)
├── (app)/                     ← mobile layout with bottom tab bar
│   ├── layout.tsx             ← tab bar: 3 tabs (member) or 4 tabs (leader) based on role
│   ├── page.tsx               ← Home
│   ├── schedule/page.tsx
│   ├── profile/page.tsx
│   ├── attendance/page.tsx    ← leader only
│   └── members/page.tsx       ← leader only
└── admin/                     ← desktop sidebar layout (separate layout.tsx)
    ├── layout.tsx
    └── page.tsx
```

- Root `/` redirects: unauthenticated → `/sign-in`, authenticated → `/` (app) or `/admin` based on role
- Route groups `(auth)` and `(app)` provide separate layouts without affecting URLs
- All role-based tab visibility is handled in `(app)/layout.tsx`

## Code Conventions

- Use App Router (`app/` directory)
- Server components by default; add `"use client"` only when needed
- Convex functions in `convex/` directory
- Role-based routing: same app, UI adapts based on user role
- Admin routes under `app/admin/` with separate desktop layout
- Mobile-first responsive design; admin is desktop-first
- Keep components small and composable
- Use Convex queries/mutations for all data access — no REST endpoints

## Design Direction

- Clean and minimal, inspired by Linear
- Neutral palette (whites, grays) with one muted accent color
- Subtle borders over heavy cards
- Typography-driven hierarchy
- Bottom tab bar navigation for mobile (member/leader)
- Sidebar navigation for admin desktop
- Account for iOS Safari safe area inset on bottom tabs
