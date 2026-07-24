---
name: zhihu-creator
description: Research Zhihu topics and questions, inspect existing answers, draft original Chinese answers, compile Markdown into Zhihu-compatible HTML, upload answer images, save answer drafts, and safely publish or update Zhihu answers. Use when the user asks to search Zhihu, choose a topic, study a question or its answers, write or revise a Zhihu answer, prepare Zhihu formatting, manage answer images, save a Zhihu draft, or publish/update an answer after explicit review. This skill does not publish articles or list/delete drafts.
---

# Zhihu Creator

Use the bundled CLI from this skill directory:

```bash
pnpm zhihu -- <command>
```

Never start a background service. Never print Cookie values. Do not execute image uploads, draft saves, or answer publishing unless the user asked for that external write.

## Workflow

1. Run `pnpm zhihu -- auth status` before authenticated work. If configuration is missing, ask the user to pipe a complete browser Cookie header into `pnpm zhihu -- auth import --stdin`. Do not ask them to paste secrets into chat.
2. Research with `search`, `feed recommend`, `feed hot`, `question show`, and `question answers`. Prefer question IDs returned by the API over IDs inferred from titles.
3. Read [references/writing-style.md](references/writing-style.md) before drafting. Use existing answers to identify coverage gaps, not to imitate or copy wording. Verify factual claims with appropriate sources outside Zhihu when accuracy matters.
4. Write the answer as Markdown in a local file. For local images, run `image upload --file <path>` only after the user explicitly requests upload, then replace the Markdown image with the returned `markdown` value.
5. Compile locally with `answer compile --input <file>` and inspect the returned HTML and warnings. Read [references/markdown.md](references/markdown.md) when the content contains formulas, tables, code, or images.
6. Save a draft with `answer draft --question-id <id> --input <file>` only when requested. The CLI detects whether the current account already has an answer.
7. Before formal publication, run `answer preview --question-id <id> --input <file>`. Show the account, exact question, create/update mode, content summary, settings, warnings, and confirmation token to the user.
8. Publish only after the user explicitly confirms that preview. Use the exact token with `answer publish --question-id <id> --input <file> --confirm <token>`. If the content, target, existing-answer state, or settings changed, generate and review a new preview.

## Commands

```bash
# Import a Cookie header securely from stdin; values are stored with mode 0600.
printf '%s' "$COOKIE_HEADER" | pnpm zhihu -- auth import --stdin
pnpm zhihu -- auth status

pnpm zhihu -- search --query "React 性能" --limit 10 --questions-only
pnpm zhihu -- feed hot --limit 20
pnpm zhihu -- feed recommend --limit 10
pnpm zhihu -- question show --id 12345678
pnpm zhihu -- question answers --id 12345678 --limit 10 --sort default

pnpm zhihu -- answer compile --input answer.md
pnpm zhihu -- image upload --file diagram.png
pnpm zhihu -- answer draft --question-id 12345678 --input answer.md
pnpm zhihu -- answer preview --question-id 12345678 --input answer.md
pnpm zhihu -- answer publish --question-id 12345678 --input answer.md --confirm <token>
```

All commands emit JSON on stdout and errors on stderr. Read [references/api.md](references/api.md) for response fields, authentication requirements, retry behavior, and supported endpoints.

## Safety boundaries

- Treat `~/.zhihu-creator/config.json` as a secret. Never commit, quote, or summarize its values.
- Do not bypass rate limits, CAPTCHA, access controls, or Zhihu risk-control responses. Report the HTTP status and request target without sensitive headers.
- Do not automatically retry draft or publish POST requests; first verify remote state to avoid duplicates.
- Do not publish articles or attempt draft listing/deletion in this version. Those interfaces are not verified by the referenced source snapshots.
- Keep all content original and user-reviewed. Do not promise that wording can evade platform or AIGC detection.
