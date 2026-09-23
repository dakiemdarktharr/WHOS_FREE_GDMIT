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
4. Start the API with `npm run dev --prefix apps/server`, then start the web app with `npm run dev` in another terminal.

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

Deploy the Express/Socket.io server to a Node host with MongoDB access, then deploy the Next.js app to Vercel. Set `API_BASE_URL` and `NEXT_PUBLIC_API_URL` to that server's public HTTPS origin in the Vercel project settings. `NEXT_PUBLIC_API_URL` is embedded in the client build, and the server's `CORS_ORIGIN` must include the Vercel origin. The Next.js deployment alone does not host the Express or Socket.io server.
