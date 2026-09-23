# Architecture workflow for agents

`documentation/api-contract.json` is the integration contract. It is the ground truth for API paths, methods, payload names, and realtime event names. If the architectural layout or routing changes, update that file and the related Obsidian page in the same change.

The Obsidian-compatible vault lives at `documentation/obsidian/`. In Obsidian, open that folder as a vault. The raw product brief is immutable; current architecture notes live under `wiki/`.

Run `npm run check:architecture` from the project root at any time. The check is intentionally dependency-light so Claude Code, DeepSeek v4 pro, or another agent running in VS Code can compare the route tree and monitored files against the documentation without needing MongoDB, Ably, or a running browser.

Before a change is considered complete, run:

```text
npm run check:architecture
npm run typecheck
npm run build
```
