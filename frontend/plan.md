# PIKOL CHAR — Implementation and Design Plan

## Product scope and implementation approach

Build the complete requested court-rental operations application, not a dashboard-only prototype. The seven routes/modules are Dashboard, Court Sessions, Players, Time Monitoring, Payment Monitoring, Reports and Settings. The working flow is: create and schedule a court session; register its players; record and validate one or more player-time intervals; calculate each player's proportional share; record and preserve collections; produce and print/export the liquidation report; and finalize a verified session. All routes use shared session/player state, so edits immediately update dependent hours, charges, balances and dashboard totals.

Use React, Vite and TypeScript with Tailwind CSS v4 and reusable Shadcn UI components; React Router; React Hook Form and Zod; TanStack Table; Lucide; date-fns; Recharts; and Vitest for the requested calculation tests. Keep `npm run dev` available. Use a pinned pnpm toolchain/lockfile for reproducible dependency installation. No login, server or managed database is in the initial scope; this is a local administrator tool using realistic seed data and localStorage. Put persistence behind a typed repository interface so a future Supabase/PostgreSQL implementation can replace the local adapter without changing feature screens or business calculations.

### Data and business rules

Create typed Court, CourtSession, Player, SessionPlayer, PlayerTimeLog, Payment, LiquidationReport and Settings models with stable IDs and explicit relationships. Persist integer centavos for money where practical and integer minutes for durations. Store a versioned local data document; seed useful historical, scheduled and active examples on first launch, and preserve subsequent user changes in the browser. Provide a clear, deliberate sample-data reset action.

Centralize pure domain utilities for session duration/rent, interval validation and duration, allocation, collection summaries and finalization. Require session end after start. Reject time-in without time-out conflicts, time-out without an active interval, duplicate active intervals, overlapping intervals for one player, and intervals outside the session. Support multiple valid intervals and sum them; refresh active-player elapsed time while the screen is open. Allocation weights are actual integer player minutes; zero-minute players receive no default charge and zero total player time never divides by zero. Calculate proportional amounts using integer cents and a deterministic largest-remainder method with a stable-ID tie-break, so chargeable players' allocations add exactly to the court rent. Keep allocations separate from append-only payment/adjustment history. Derive paid, partial and unpaid status from collected total and current due; show overpayment as credit rather than silently discarding it. When a session is finalized, lock destructive/session/charge edits; offer a reason-recorded adjustment flow with an audit trail rather than overwriting prior payment records. Finalization requires a completed session, no open time interval and a valid allocation; outstanding collections remain visible as “Pending Collection” rather than being hidden.

### Project structure

- `src/app/` — router, app shell and route-level composition.
- `src/components/layout/` — responsive sidebar, header, page headings and navigation drawer.
- `src/components/ui/` — reusable Shadcn primitives and shared table, status, empty-state, confirmation and form elements.
- `src/features/{dashboard,sessions,players,time-monitoring,payments,reports,settings}/` — module screens, forms and feature-specific interactions.
- `src/domain/` — typed entities, Zod schemas, status rules and pure money/time/session calculation utilities.
- `src/data/` — repository contract, localStorage adapter, versioned persistence and realistic seed data.
- `src/lib/` — currency/date/time formatting and common helpers.
- `src/test/` or colocated `*.test.ts` files — unit tests for rent, interval sums/validation, allocation/rounding, partial collections, balances and finalization.
- `public/manus-routes.json` — the seven declared application page routes, kept synchronized with React Router.

## Design direction

Follow the user's explicit restrained commercial-admin direction rather than introduce an alternate aesthetic: white surfaces, slate text/navigation, neutral #F8FAFC secondary surfaces and #E2E8F0 borders; #15803D only for successful/completed states, with #D97706 and #DC2626 for warning/error. Use Inter, compact information-dense tables, 6–8px radii and thin borders. The desktop shell has a fixed ~240px sidebar and simple top header; at tablet it collapses, and on mobile it becomes a drawer with compact statistics and accessible time controls. Avoid gradients, glass effects, decorative illustrations and large shadows. Use clear labels, concise confirmation dialogs, visible empty/error states and subtle hover/focus feedback. Keep reports print-first and uncluttered; provide actual PDF export as well as print.

## Build workflow and constraints

Initialize the flexible Vite/React/TypeScript project (the requested stack differs from the default web starter), pin dependencies and configure Tailwind v4 and Shadcn primitives. Register the host-managed TypeScript diagnostics before the first source-code batch. Implement the domain and local repository before connecting feature UI; then build the responsive shared shell and all seven screens against the same data model. Include calculation-focused Vitest coverage, type-check/build scripts and route manifest. Start the development server on the configured port 3000 and verify the route manifest and build. Save completed code to the canonical Manus project checkpoint; leave public publishing off unless separately requested. The first release is a single-browser local-data tool, so localStorage is not multi-device synchronization or secure role-based authorization; keep that boundary clear in the interface and architecture.