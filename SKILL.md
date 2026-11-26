---
name: zhihu-cli
description: Use the zhihu-cli command to import a local Zhihu Cookie, research questions, answers, comments, feeds, users and topics, compile Markdown, and safely preview or apply Zhihu account actions. Use for Zhihu research, account workflows, content creation, or CLI setup in Codex, Hermes, OpenClaw, and other terminal-capable agents.
homepage: https://github.com/NNNNzs/zhihu-cli
metadata:
  version: "1.0.3"
  author: NNNNzs
  license: AGPL-3.0-only
  repository: https://github.com/NNNNzs/zhihu-cli
  openclaw:
    emoji: "🧠"
    homepage: https://github.com/NNNNzs/zhihu-cli
    requires:
      bins: [node, npm]
---

# zhihu-cli

Use this Skill's CLI for Zhihu research and account workflows. Treat all Zhihu Web endpoints as unofficial and unstable. Never bypass CAPTCHA, access control, rate limits, or risk control.

## Run the CLI

Install with npm once, then use the canonical `zhihu-cli` command:

```bash
# From the npm registry
npm install -g zhihu-cli

# Or install the current GitHub source with npm
npm install -g github:NNNNzs/zhihu-cli

zhihu-cli <command>
```

The package name, Skill name, and canonical executable are all `zhihu-cli`. Do not start a background service.

All commands default to JSON. Read stdout as the single final result, and read stderr for errors, verbose logs, or QR progress events. Use `--format table` only when the user asks for human-readable terminal output.

## Authenticate safely

1. Run `zhihu-cli auth status --offline` before authenticated work.
2. If login is missing or expired, guide the user to sign in on `www.zhihu.com`. In their browser, open DevTools → Network → Doc and refresh the page. Select the document request for `www.zhihu.com` and copy the full value of `cookie` under Headers → Request Headers. Then ask them to run `zhihu-cli auth import` in their own terminal, paste at the prompt, and press Enter. The terminal hides the input. See the [login guide](README.md#登录) for details.
3. Never request a Cookie in chat, extract one from chat, put one in an argument, read the config file, or echo Cookie values.
4. If the user explicitly requests CLI QR login, keep it in their foreground terminal and never relay the QR code, URL, or token. If Zhihu refuses the request or status check, direct the user to the official Zhihu login page, then have them run `zhihu-cli auth import` with the browser Cookie.

Cookie import automatically attempts safe completion; use `auth repair` for an existing config. For a 401, try `auth repair` first. If it persists, ask the user to sign in again in their browser and import a fresh Cookie. Use `auth whoami`, `auth status`, and `auth logout` for account inspection and local logout.

## Research

Use bounded queries and retain returned IDs:

```bash
zhihu-cli search --query "关键词" --type general --limit 10
zhihu-cli feed hot --limit 20
zhihu-cli feed hot-search --limit 20
zhihu-cli feed recommend --limit 10
zhihu-cli question <question-id>
zhihu-cli question answers <question-id> --limit 10
zhihu-cli answer <answer-id>
zhihu-cli answer comments <answer-id> --limit 20
zhihu-cli article show <article-id>
zhihu-cli user <url-token>
zhihu-cli user answers <url-token>
zhihu-cli topic <topic-id>
zhihu-cli topic questions <topic-id>
```

Only use explicit `--all` when the user needs all answer comments; it still has a page cap. Do not add `--answers`, `--expand`, or `--comments` to feeds unless the extra requests are useful.

Read [references/writing-style.md](references/writing-style.md) before drafting original Zhihu content. Use existing answers to find coverage gaps, never to copy wording. Read [references/markdown.md](references/markdown.md) for tables, code, equations, and images. Verify factual claims with appropriate primary sources when accuracy matters.

## Protect every write

Require a preview and an explicit user decision before applying any vote, follow, image upload, draft, publication, or deletion. Never treat the user's initial request to prepare or preview content as confirmation to apply it.

The preview returns a `confirmationToken` bound to the account, operation, target, remote state, title, body, topics, settings, and image hashes. Show the important preview fields and token to the user. Apply only after the user explicitly confirms that exact preview. If anything changes, preview again.

```bash
# Interactions
zhihu-cli answer vote preview <answer-id> --state up
zhihu-cli answer vote apply <answer-id> --state up --confirm <token>
zhihu-cli question follow preview <question-id>
zhihu-cli question follow apply <question-id> --confirm <token>

# Image
zhihu-cli image upload --file <path>
zhihu-cli image upload --file <path> --confirm <token>

# Answer
zhihu-cli answer compile --input <file>
zhihu-cli answer preview --question-id <id> --input <file> [--image <path>]
zhihu-cli answer publish --question-id <id> --input <file> --confirm <token> [--image <path>]
zhihu-cli answer draft --question-id <id> --input <file>
zhihu-cli answer draft --question-id <id> --input <file> --confirm <token>

# Question, pin, article
zhihu-cli question create preview --title <title> --input <file> [--topic <id>] [--image <path>]
zhihu-cli question create publish --title <title> --input <file> --confirm <token> [--topic <id>] [--image <path>]
zhihu-cli pin create preview --title <title> --input <file> [--image <path>]
zhihu-cli article create preview --title <title> --input <file> [--topic <id>] [--image <path>]

# Delete owned content
zhihu-cli question delete preview <id>
zhihu-cli question delete apply <id> --confirm <token>
```

For local Markdown images, let preview validate and hash the files. Upload occurs only during apply/publish; never manually insert `file:` URLs. Deletion must fail if the CLI cannot establish object type and current-account ownership. Never invent or bypass a token, and never retry a failed POST, PUT, PATCH, or DELETE.

Read [references/api.md](references/api.md) when choosing authentication requirements, pagination, aliases, or error handling. Do not perform real write smoke tests; use [docs/manual-write-validation.md](docs/manual-write-validation.md) and ask the user before each live write.
