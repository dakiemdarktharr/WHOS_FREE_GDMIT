# Claude Code project instructions

The repository root is `D:\\WHOS_FREE_GDMIT_proj`.

Before changing code, read:

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/API_ROUTES.md`
- `docs/DATABASE_SCHEMA.md`

The `/docs` files are the structural ground truth for the Phase 1 migration. Keep route names, event names, model fields, and timezone rules synchronized with them. Do not stage `.env.local`, Vercel tokens, MongoDB credentials, or DeepSeek API keys.

Use the repository's safe-directory form when Git reports ownership differences:

```powershell
git -c safe.directory=D:/WHOS_FREE_GDMIT_proj status --short --branch
```

Run the relevant build and type checks before committing. Do not use destructive reset or checkout commands, and do not add `TODO` comments.
