# Changelog

All notable changes to CoreClaw are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.1.29] - 2026-03-25

### Changed

- **Default timeout values raised to 1 hour** — Changed the default values of `CONTAINER_TIMEOUT` and `IDLE_TIMEOUT` in `src/config.ts` from `1800000` ms (30 min) to `3600000` ms (1 hour). These defaults apply when no value is set in `.env` or `process.env`.
- **`setup.sh` — also sets `IDLE_TIMEOUT=3600000`** — Added `IDLE_TIMEOUT=3600000` to the generated `.env`. Also added a filter to exclude any commented `# IDLE_TIMEOUT` line from `.env.example` during copy to prevent duplicates.

---

## [0.1.28] - 2026-03-25

### Fixed

- **`CONTAINER_TIMEOUT` in `.env` was not applied** — `config.ts` read `CONTAINER_TIMEOUT` (and other config keys) from `process.env` only, so values written to `.env` were ignored unless explicitly passed as environment variables on startup. Fixed by adding all configurable keys (`CONTAINER_IMAGE`, `CONTAINER_TIMEOUT`, `CONTAINER_MAX_OUTPUT_SIZE`, `CREDENTIAL_PROXY_PORT`, `IDLE_TIMEOUT`, `MAX_CONCURRENT_CONTAINERS`) to the `readEnvFile()` call so `.env` values are correctly picked up at startup.

---

## [0.1.27] - 2026-03-25

### Fixed

- **Enforce English-only text in all generated graphs** — Added an explicit rule across scientist skills requiring all figure text elements (titles, axis labels, legends, tick labels, annotations, captions) to be written in English. Applied to:
  - `skills/scientist/SKILL.md` — Added a mandatory "English-only graphs" rule section with correct/incorrect code examples, covering all matplotlib / seaborn / plotly text elements.
  - `skills/scientist/scientific-pipeline-scaffold/SKILL.md` — Added inline comment to `plt.rcParams.update()` block enforcing the rule.
  - `skills/scientist/scientific-publication-figures/SKILL.md` — Added warning callout in Quick Start section.
  - `skills/scientist/scientific-hypothesis-pipeline/SKILL.md` — Added inline comment to `plt.rcParams.update()` block enforcing the rule.

---

## [0.1.26] - 2026-03-25

### Changed

- **`setup.sh` — set `CONTAINER_TIMEOUT=3600000` in `.env`** — Added `CONTAINER_TIMEOUT=3600000` (1 hour) to the generated `.env` to prevent container timeout errors on long-running tasks. Also excluded the commented `# CONTAINER_TIMEOUT` line from `.env.example` during copy to avoid duplicate entries.

---

## [0.1.25] - 2026-03-25

### Fixed

- **Japanese characters appear as □ in generated PNG images** — `plt.rcParams.update()` in three scientist skill templates was overwriting the system-wide `matplotlibrc` font list with `["Arial", "Helvetica", "DejaVu Sans"]`, which contains no CJK fonts. Fixed by prepending `"Noto Sans CJK JP"` and `"IPAGothic"` to the `font.sans-serif` list in all three affected files:
  - `skills/scientist/scientific-pipeline-scaffold/SKILL.md`
  - `skills/scientist/scientific-hypothesis-pipeline/SKILL.md`
  - `skills/scientist/scientific-publication-figures/SKILL.md`

---

## [0.1.24] - 2026-03-25

### Added

- **`start.sh`** — Added a convenience start script that launches the server with default port settings (`CORECLAW_WEB_PORT=3000 CREDENTIAL_PROXY_PORT=3051 npm start`).

---

## [0.1.23] - 2026-03-25

### Fixed

- **Missing `init()` function declaration** — When inserting the Mermaid popup code in v0.1.22, the `async function init() {` declaration line was accidentally removed, causing Chat Groups to not appear and sidebar open/close to stop working.
- **Artifact viewer zoom in/out direction** — Fixed a reversed zoom direction bug where the ＋ button zoomed out and the ー button zoomed in (＋ → `avZoom(+10)`, ー → `avZoom(-10)`).
- **Chat output not visible** — Fixed an issue where the v0.1.22 "streaming reload resilience" implementation skipped all messages with `streaming:true` metadata, causing all completed assistant messages to be invisible.
  - `src/experiments.ts` — `updateMessageContent()` now also sets `metadata = NULL` when updating content, preventing the `streaming:true` flag from persisting after completion.
  - `public/index.html` — Changed the skip condition to `meta.streaming && !msg.content` (skip only when content is empty) so completed messages with `streaming:true` remaining in existing DB records are displayed correctly.

### Added

- **`setup.sh`** — Added a one-step setup script that consolidates `npm install` / `.env` generation / `npm run build` / `./container/build.sh`. Automatically retrieves the GitHub Token via `gh auth token` and writes it to `.env` if available.

---

## [0.1.22] - 2026-03-24

### Added

- **Code block UI improvements** — Added language label headers, **Copy** buttons, and **collapse (▼/▶)** buttons to all code blocks in chat.
- **Stop button in streaming messages** — Added a ⏹ Stop button directly inside the message display while the agent is responding.
- **Streaming reload resilience** — After a browser reload, restores in-progress streaming text to the UI from the `list_tasks` response. Also skips incomplete `streaming:true` records when loading messages.
- **Full-text message search** — Full-text search across past messages in a chat group. Launched from the 🔍 Search button in the header; matching keywords are highlighted. Uses SQLite `LIKE` query.
- **Copy button in artifact viewer** — Added a 📋 Copy button to the viewer header. Clicking it copies the file contents to the clipboard.
- **Memory summary indicator** — Added a progress bar to the Memory modal showing "Until next auto-compaction: N messages remaining".
- **Chat group archive feature** — Archive/unarchive via the 📦 button in the sidebar. Archived items are displayed in gray with strikethrough. Sets `status = 'archived'` via PATCH API.
- **Mermaid diagram click to viewer popup** — Clicking a `mermaid` code block in chat renders it in an inline viewer popup. No backend API required.
- **Settings export/import** — Added 📤 Export / 📥 Import buttons to the Settings modal. Backs up/restores `settings.json` as a JSON file.

### Changed

- `src/experiments.ts` — Added `searchMessages()` function (SQLite LIKE search).
- `src/web-server.ts` — Added `GET /api/experiments/:id/messages/search?q=` endpoint.

---

## [0.1.21] - 2026-03-24

### Changed

- **Artifact viewer popup from links in chat** — Both artifact filename links (`linkifyArtifacts`) and Markdown links (`` `[text](file.md)` `` format) in chat messages now open in an inline viewer popup in the same window instead of a new tab.
  - Each link is generated with a `data-artifact` attribute and `chat-artifact-link` class; a delegate click handler calls `viewArtifact()`.
  - `renderer.link` (marked.js renderer for chat) compares `href` against `cachedArtifacts`: opens a popup for artifacts, continues to open external URLs with `target="_blank"`.
  - Changed `fileMap` in `linkifyArtifacts` to store artifact paths instead of URLs.

---

## [0.1.19] - 2026-03-24

### Fixed

- **Artifact viewer width still not taking effect (CSS specificity)** — `.artifact-viewer` was defined at line 831, before the base `.modal { max-width: 500px }` rule at line 997. Because both are single-class selectors with equal specificity, the later rule always won regardless of the `max-width: none` addition in v0.1.18. Fixed by changing the selector to `.modal.artifact-viewer` (two-class selector, higher specificity than `.modal` alone), ensuring the 90 vw width is applied unconditionally.

---

## [0.1.18] - 2026-03-24

### Fixed

- **Artifact viewer width not taking effect** — The base `.modal { max-width: 500px }` rule was overriding `.artifact-viewer`'s `width: 90vw` declaration. Added `max-width: none` to `.artifact-viewer` to explicitly reset the inherited constraint; the popup now spans 90 % of the viewport width as intended.

---

## [0.1.17] - 2026-03-24

### Changed

- **Artifact viewer — full 90 % width**: removed the `max-width: 1100px` cap from `.artifact-viewer`; the popup now spans exactly 90 % of the viewport width on any screen size.
- **Artifact viewer — zoom in / out**: added **－** and **＋** buttons in the viewer header. Each click adjusts the content zoom level by 10 % (range: 50 %–200 %). The current zoom percentage is displayed between the buttons. Zoom resets to 100 % each time a new file is opened.

---

## [0.1.16] - 2026-03-24

### Added

- **Artifact inline viewer** — Clicking 👁 View in the Artifacts panel now opens a full-featured popup modal in the same window instead of a separate tab.
  - **Markdown** — Rendered via `marked.js` with a custom image renderer that rewrites relative `figures/` paths to `/api/experiments/:id/artifacts/...` URLs, so figures embedded in `report.md` display inline.
  - **PNG / JPG / WebP / GIF** — Images rendered directly in the viewer body.
  - **JSON** — Pretty-printed with `JSON.stringify(…, null, 2)`.
  - **Python / JavaScript / TypeScript / R / Shell / YAML / CSV / plain-text** — Syntax-highlighted monospace code block.
  - **Mermaid (`.mmd`)** — Diagram rendered via `mermaid@11` (CDN), same dark-theme settings as `viewer.html`.
  - **PDF** — Embedded via `<iframe>`.
  - Raw/Rendered toggle button; Download button; Esc / ✕ / overlay-click to close.
- `mermaid@11` CDN script added to `public/index.html`; `mermaid.initialize()` called in `init()` with theme-aware settings.

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
