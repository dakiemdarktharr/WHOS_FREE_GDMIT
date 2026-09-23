# Who's free, gdmit

Who's free, gdmit helps a group find the quietest time to meet. Everyone marks the hours when they are busy, and the room ranks the shared windows with the fewest conflicts.

## Stack

- Next.js App Router and TypeScript
- MongoDB Atlas for plans, members, and availability
- Ably for realtime room updates and presence
- Vercel for deployment

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add MongoDB Atlas and Ably credentials.
4. Start the app with `npm run dev`.

Useful checks:

```text
npm run check:architecture
npm run typecheck
npm run build
```

## Documentation ground truth

The integration contract lives at [`documentation/api-contract.json`](documentation/api-contract.json). The Obsidian-compatible vault is [`documentation/obsidian`](documentation/obsidian). Run `npm run check:architecture` whenever routes or architectural layout change.

## Deployment

Import this repository into Vercel and configure the same variables from `.env.example` in the Vercel project settings. Set `NEXT_PUBLIC_APP_URL` to the deployed Vercel URL.
