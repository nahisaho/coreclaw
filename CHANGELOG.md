# Changelog

All notable changes to CoreClaw are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.1.15] - 2026-03-24

### Fixed

- **Background agent blocks subsequent responses** — The memory summariser ran `runContainerAgent` with the same `groupFolder` as the main experiment agent, so both containers shared the same IPC directory (`data/ipc/experiment-<id>/input/`). After the summariser received its Copilot output it stayed alive in the `waitForIpcMessage()` poll loop because no `_close` sentinel was written. When the user sent the next message, the new main agent wrote a `_close` sentinel via `closeContainer()`. The still-running summariser consumed (unlinked) that sentinel and exited — leaving the new main agent stuck in `waitForIpcMessage()` forever. The container never exited, `onDone` was never invoked, and `agent_done` was never broadcast to the WebSocket client. Fixed by writing the `_close` sentinel in the summariser's `onOutput` callback immediately after receiving the summarisation result.

---

## [0.1.14] - 2026-03-24

### Changed

- **Scientist skill — figure embedding in `report.md`**: figures saved to `figures/` are now embedded in the report as `![Caption](figures/file.png)` relative paths. Python pattern updated to use a `fig_path` variable with `.relative_to(BASE_DIR)` for the embed string. Report required structure renumbered: new section 5 is "figure embedding" (old 5→6, old 6→7). New `図表リンクルール` section added with a Markdown example and a checklist.

---

## [0.1.13] - 2026-03-24

### Fixed

- **Auto-restart fails with EADDRINUSE** — Store `activeHttpServer` reference and call `server.close()` before spawning the child process so the TCP port is fully released. A 3-second hard-kill timeout forces the spawn even if active connections linger.
- **Stale compiled code after update** — `updateComponent('coreclaw')` now runs `npm run build` after `npm install` so the updated TypeScript is compiled before the new process starts.

---

## [0.1.12] - 2026-03-24

### Changed

- Version bump only (no functional changes).

---

## [0.1.11] - 2026-03-24

### Added

- **Per-group conversation memory with auto-summarization**
  - New `src/memory.ts`: rolling summary storage (`experiment_memory` table), `buildMemoryContext()`, `needsSummarization()`, `buildSummarizationPrompt()`.
  - `src/experiments.ts`: `getRecentMessages()`, `getMessagesFromOffset()`, `initMemoryDb()`.
  - `src/web-server.ts`: memory context injected into prompt before each agent call; async summarization triggered after each response; memory API endpoints (`GET/DELETE /api/experiments/:id/memory`, `POST /api/experiments/:id/memory/summarize`); `setMemorySummarizer()` export.
  - `src/index.ts`: registers `memorySummarizer` using `runContainerAgent`.
  - UI: memory badge in header, memory management modal (view summary, manual compress, clear memory).
  - Behaviour: last 5 user/assistant pairs always injected verbatim; auto-summarization triggers when total messages > 20; summary stored in DB and progressively updated on each compaction pass.

---

## [0.1.10] - 2026-03-24

### Added

- **Auto-restart on update** — Server restarts automatically after a CoreClaw update is applied.
- Port numbers (`CORECLAW_WEB_PORT`, `CREDENTIAL_PROXY_PORT`) are inherited by the restarted process.

---

## [0.1.9] - 2026-03-24

### Fixed

- **Cross-group streaming leaks** — Moved subscription management to the server side. Each WebSocket client now subscribes to a specific `groupId`; the server filters broadcast events by subscriber list, preventing messages from one chat group appearing in another.

---

## [0.1.8] - 2026-03-24

### Fixed

- **Streaming messages leak across chat groups** — Client-side deduplication and group-scoped rendering added to prevent output from one agent appearing in a different chat group's view.

---

## [0.1.7] - 2026-03-23

### Changed

- **Single skill selection** — Skill selector changed from multi-select to single-select; removed the "All Skills" option from sidebar and modal selectors; removed All/None toggle buttons.

### Fixed

- Sidebar skill selector used wrong HTTP method (`PUT` → `PATCH`).

---

## [0.1.6] - 2026-03-23

### Added

- **Multi-skill selection** — Checkbox-based skill selector with search and All/None toggle; popup-based selectors in sidebar and Edit Chat dialog.
- MIT license (`LICENSE` file + `package.json`).
- Qiita article: CoreClaw comprehensive guide (`qiita/coreclaw-guide.md`).
- MCP preset buttons for ToolUniverse and Deep Research in Settings.

### Changed

- `skills-sync`: Set-based skill filtering.

---

## [0.1.5] - 2026-03-23

### Added

- **Pin chat groups** — 📍/📌 toggle; pinned groups float to top of sidebar, persisted in DB.
- RFC 5987 `filename*` support in multipart parser for non-ASCII (Japanese, etc.) filenames.

### Changed

- Renamed "+ New Chat" to "+ New Chat Group".

### Fixed

- CJK bold rendering broken by custom `**` preprocessor — removed the preprocessor; `marked@15` handles CJK bold natively.

---

## [0.1.4] - 2026-03-23

### Added

- 9 MCP E2E tests (presets, persistence, per-chat selection, API).

### Fixed

- Japanese filename upload: preserve Unicode characters in uploaded filenames.
- E2E tests: restore settings after each test to prevent token pollution between runs.
- Sidebar toggle, provider select, and settings save E2E tests.

---

## [0.1.3] - 2026-03-23

### Added

- **MCP server management** — ToolUniverse and Deep Research preset buttons in Settings.
- **GitHub MCP Tools** — Optional GitHub API access (repos, issues, PRs) via Settings > Copilot.
- **Custom MCP servers** — `stdio`/`SSE`/`streamable-http` with environment-variable pass-through.
- **Per-chat MCP selection** — Choose which MCP servers to use per chat group (New/Edit Chat).
- Docker container: added `uv`/`uvx` for Python-based MCP servers.
- Agent runner: `--additional-mcp-config` and `--enable-all-github-mcp-tools` support.
- All 14 built-in skill files updated with MCP integration instructions.
- New sub-skill: `scientist/scientific-deep-research`.

### Fixed

- Self-update: `RUNNING_VERSION` detection; restart-only update path added.
- Settings: Save button now closes the modal.

---

## [0.1.2] - 2026-03-23

### Added

- Auto-rebuild Docker image when `container/` files change during a CoreClaw update.
- Auto-restart server after CoreClaw update (process.exit + reload countdown).

### Changed

- Docker rebuild is non-fatal: warns on failure and continues the update.

---

## [0.1.1] - 2026-03-23

### Added

- **Skill scanner whitelist** — Dismiss findings with persistent OK checkboxes; whitelisted items are excluded from risk-level calculation.
- Copilot CLI update path: use `copilot update` instead of `npm install -g`.
- Updates tab: CoreClaw self-update via `git pull` (replaced "Agent Skills" entry); Check button to verify available updates before applying.

### Changed

- Removed Settings > GitHub > Sync Repository (use per-chat `sync_repo` only).

### Fixed

- GitHub sync conflict handling: `rebase --abort` + re-clone on conflict.
- Version regex: exclude trailing dots (e.g. `1.0.10.` → `1.0.10`).
- Removed orphaned `educationalistscanwhitelist` skill folder.

---

## [0.1.0] - 2026-03-23

### Added

- Initial release.
- Chat frontend with WebSocket streaming.
- Agent orchestrator with GitHub Copilot CLI.
- Skill management system (CRUD, ZIP upload, per-chat filtering).
- Skill scanner with security risk detection (green / yellow / red).
- Experiment management with SQLite persistence.
- GitHub sync (push/pull experiments).
- Docker support (`coreclaw-agent` image).
- Built-in skills: `scientist` (195 sub-skills), `educationalist`, `general-assistant`, `consultant` (generic + ACN/BCG/McKinsey/PwC firm-specific variants).
