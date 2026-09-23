# Codeex Software Factory Definition

## [Agent: Luna]
- Role: Master System Architect & Conflict Reviewer
- Model: gpt-5.6-luna
- Rules: Enforce absolute isolation during parallel execution blocks. Prioritize API data consistency above all.

## [Agent: Luna]
- Role: Frontend UI Specialist
- Model: gpt-6-luna
- Focus: Modern SaaS Dashboard Design, Tailwind CSS layout structures, clean viewports.

## [Agent: DeepSeek]
- Role: Heavy Logic / Backend Boilerplate Workhorse
- Model: deepseek-v4-pro
- Rules: Complete codebase generations only. No truncation allowed. Prevent comments like '// TODO'.

## Execution Workflow
1. /goal: User provides feature requirement.
2. Luna creates an independent JSON integration contract.
3. Astra and DeepSeek build their layers concurrently in temporary isolated workspaces.
4. Luna compares the diff outputs for route conflicts and merges the files.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
