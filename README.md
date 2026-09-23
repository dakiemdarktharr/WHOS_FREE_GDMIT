# Who's free, gdmit

Who's free, gdmit helps a group find the quietest time to meet. Everyone marks the hours when they are busy, and the room ranks the shared windows with the fewest conflicts.

## Stack

- Next.js App Router and TypeScript for the room UI
- Express, MongoDB, and Socket.io for the canonical five-digit room API
- The earlier `/api/v1/plans` and `/plan/[code]` implementation remains in the repository during migration; `docs/` defines the current room contract.

## Local setup

1. Install dependencies with `npm install` and `npm install --prefix apps/server`.
2. Copy `.env.example` to `.env.local`.
3. Set `MONGODB_URI` and `MONGODB_DB`. Set `API_BASE_URL` and `NEXT_PUBLIC_API_URL` to the reachable Express server (for example `http://localhost:4000`). The old `/api/v1/plans` routes also require `ABLY_API_KEY` if used.
4. Start the API with `npm run dev --prefix apps/server`, then start the web app with `npm run dev` in another terminal. On Windows, if Node.js cannot resolve the MongoDB Atlas SRV record, run `pwsh -File scripts/start-phase1-api.ps1` to resolve the same public seed list through Windows DNS and start the API without changing credentials.

Useful checks:

```text
npm run check:architecture
npm run typecheck
npm test --prefix apps/server
npm run build
```

## Documentation ground truth

The current room contract lives in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/API_ROUTES.md`](docs/API_ROUTES.md), and [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md). [`documentation/api-contract.json`](documentation/api-contract.json) and `npm run check:architecture` cover the earlier `/api/v1/plans` routes.

## Deployment

Deploy `apps/server` as a separate Vercel Express project with `MONGODB_URI` and `MONGODB_DB` configured in its environment. Set the Next.js project's `API_BASE_URL` to the Express project's public HTTPS origin and redeploy the web project. A persistent Node host can also run the Express/Socket.io server; set `NEXT_PUBLIC_API_URL` to that host for live Socket.io updates. The browser polls the room result every five seconds when Socket.io is unavailable, including on Vercel functions. The Next.js deployment alone does not host the Express API.
