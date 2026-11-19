# PIKOL CHAR — Court Rental & Player Payment Monitoring System

PIKOL CHAR is a local-first court operations application for session scheduling, player registration, interval-based time tracking, proportional rent allocation, payment collection and liquidation reporting.

## Run locally

Use Node.js 20.19+ and pnpm 11. The project also exposes `npm run dev` as requested.

```sh
pnpm install
npm run dev
```

The development server listens on port `3000`. For checks and a production build:

```sh
npm run typecheck
npm test
npm run build
```

## Data and accounting

The first launch seeds a small set of courts, current/upcoming/historical sessions and sample player/payment records. Changes are stored in this browser's localStorage. They are not uploaded, synchronized across devices or protected by server-side access controls. Use Settings → Reset sample data to replace the current local dataset.

Money is stored in integer PHP centavos and time durations in integer minutes. The court rental is allocated over positive player minutes with a deterministic largest-remainder method, so rounding cents reconcile to the session rent. Collections and corrections are retained as ledger entries rather than replacing past transactions.

## Modules

Dashboard, Court Sessions, Players, Time Monitoring, Payment Monitoring, Reports and Settings share a single typed repository boundary. A future Supabase adapter can implement that boundary without changing page-level business logic.