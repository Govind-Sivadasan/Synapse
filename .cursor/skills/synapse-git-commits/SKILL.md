---
name: synapse-git-commits
description: Write Synapse git commit messages in Govind's bullet format and commit safely. Use whenever the user asks to commit, create a commit, amend a message, or rewrite commit history in this repo.
---

# Synapse git commits

## Message format (required)

```
<type>: <short imperative summary>

- <bullet: concrete change>
- <bullet: concrete change>
```

### Rules

- **Subject**: one line, `feat:` / `fix:` / `bugfix:` prefix, imperative mood, focus on *why* or outcome.
- **Body**: **bullet list only** — each line starts with `- `. No prose paragraphs.
- **Bullets**: 2–6 items; name files/areas only when helpful; describe user-visible or architectural impact.
- **Never add** `Co-authored-by: Cursor` or other trailers unless the user explicitly asks.

### Good example (from this repo)

```
feat: Add routing monitor sidecars, resizable tables, and operations polish

- Add Dashboard and Routing Monitor sidecars for sources, associations, rules, and destinations
- Improve DataTable column resize while preserving auto layout by default
- Add shared ModalitySelect and migration jobs table layout fixes
- Fix today's modality chart to use calendar UTC day start
- Allow operators to create nodes with correct audit role attribution
```

### Bad (do not use)

```
feat: Add Phase 0 performance observability

Instrument routing and migration pipelines with Redis-backed Prometheus
metrics, a baseline API, and a load-test script.
```

## Before committing

1. Run in parallel: `git status`, `git diff`, `git log -5 --oneline`
2. Stage only relevant files (never `.env`, credentials, secrets)
3. Draft message using the bullet format above
4. Commit only when the user explicitly asks


## Rewriting an older commit message

When fixing message format on a non-HEAD commit:

1. Write the new message to `.git/COMMIT_MSG_TMP`
2. `git rev-parse '<hash>^{tree}'` and `git rev-parse '<hash>^'`
3. `git commit-tree <tree> -p <parent> -F .git/COMMIT_MSG_TMP`
4. Re-chain child commits the same way if needed
5. `git reset --hard <final-hash>`

## Safety

- Never `git push --force` unless the user explicitly requests it
- Never skip hooks (`--no-verify`) unless the user explicitly requests it
- Never amend commits already pushed to remote unless the user explicitly requests it
