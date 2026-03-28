# Changelog

All notable changes to CoreClaw are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [0.1.52] - 2026-03-29

### Changed

- **English UI labels for auth and language hint**: 左ペインの `Copilot Auth` サマリー表示と Settings → General の出力言語説明文を英語表記に更新しました。

## [0.1.51] - 2026-03-29

### Fixed

- **Marketplace Import Update button state**: Settings → Skills の Marketplace Import 一覧でも、アップデート不可のときは `Update` ボタンが disabled になるよう統一しました。

## [0.1.50] - 2026-03-29

### Fixed

- **Streaming chat Stop button**: Chat response Stop now targets the exact running task container by task ID, so cancelling during an active streaming response stops the in-flight agent execution instead of waiting for the query to finish.

## [0.1.49] - 2026-03-29

### Fixed

- **Marketplace refresh updates installed skill status**: Settings → Skills → Refresh Marketplace now reloads both marketplace cards and installed skill cards, so imported skills immediately show the latest marketplace version and update availability.
- **Update button enablement**: Imported skill `Update` buttons in Settings → Skills are now disabled unless a marketplace update is actually available.

## [0.1.48] - 2026-03-29

### Added

- **Benchmark run definitions**: Added machine-readable benchmark definitions in `tests/benchmark-prompts.json` with markdown fallback support for benchmark matching.
- **Benchmark results viewer**: Added a `Benchmarks` modal in the web UI to inspect benchmark run status, artifact coverage, missing files, and evaluation summaries.

### Changed

- **Benchmark run API**: Added an experiment benchmark-runs API that serves persisted manifest, artifact check, and evaluation records.
- **GitHub sync diagnostics export**: GitHub sync now includes experiment `logs/`, including benchmark run diagnostics, in addition to artifacts and conversation history.

## [0.1.47] - 2026-03-28

### Changed

- **Activity fallback from History**: Settings and streaming Activity views now backfill missing activity entries from Process History status lines, so literature-search progress such as `Calling ToolUniverse-execute_tool` remains visible in Activity even when only History captured the live status.

## [0.1.46] - 2026-03-28

### Changed

- **Process History timeline**: History popup now preserves and displays step-by-step runtime events such as container startup, model selection, and intermediate agent status updates instead of showing only the prompt and the latest status.
- **Completed HISTORY output**: Completed chat runs now write a `Process` section to `groups/experiment-*/HISTORY.md` so runtime progression is retained alongside the prompt and response.
- **Activity log detail view**: Added a dedicated Activity log timeline with structured task, tool, command, file, and model events, plus live updates and filtering in the web UI.
- **Research activity labeling**: Activity and in-progress status views now translate literature-search tool calls such as `ToolUniverse-execute_tool` and `web_search` into user-friendly research progress labels.
- **Output language setting**: Settings now include an `Output Language` selector so final agent responses can be requested in either Japanese or English.
- **Marketplace installed version precedence**: Settings → Skills now prefers marketplace import metadata when showing the installed version of marketplace-imported skills, so the displayed version updates correctly after a marketplace update.

## [0.1.45] - 2026-03-28

### Changed

- **Process History lifecycle**: Running tasks are now the only items kept in the database-backed History popup. Completed responses are written to `groups/experiment-*/HISTORY.md`, while cancelled and failed tasks are written to `data/experiments/*/logs/process-history.jsonl` and removed from the DB.
- **History prompt rendering**: Fixed the History popup so active tasks show the real prompt instead of getting stuck on the placeholder `Running task` label.
- **Streaming panel width**: The in-progress process panel now matches the prompt input width.

## [0.1.44] - 2026-03-28

### Fixed

- **EADDRINUSE on restart**: Credential proxy server is now properly closed before process re-exec during CoreClaw self-update, preventing port conflicts on restart.

### Changed

- **Stop button icon**: Sidebar stop control now uses 🔴 (red circle) emoji instead of ⏹️.

## [0.1.43] - 2026-03-28

### Changed

- **SIGHUP restart flow**: CoreClaw self-update now requests restart with `kill -HUP` and then runs the existing graceful drain-and-reexec path from that signal.
- **Emoji stop control**: The sidebar stop control next to Settings now uses emoji-only button states instead of text.

## [0.1.42] - 2026-03-28

### Added

- **Sidebar stop control**: Added a `Stop` button next to the sidebar Settings button that shuts down the running CoreClaw web server process through the UI.

## [0.1.41] - 2026-03-28

### Changed

- **Non-modal update actions**: The imported skill action label in Settings → Skills is now `Check`, and failed CoreClaw updates in Settings → Updates no longer open a blocking browser popup.

## [0.1.40] - 2026-03-28

### Changed

- **Check Update is non-modal**: Settings → Skills no longer shows a blocking browser popup when checking Marketplace updates for imported skills; the result is reflected directly in the skill list.

## [0.1.39] - 2026-03-28

### Added

- **Imported marketplace skill updates**: Skills imported from Marketplace now show a local version in Settings → Skills, can check for Marketplace updates, and expose an update button when a newer Marketplace version is available.

## [0.1.38] - 2026-03-28

### Added

- **Marketplace skill versions**: Settings → Skills → Marketplace Import now reads each marketplace root `skill.json` and shows its version on the skill card and in the info popup.

## [0.1.37] - 2026-03-28

### Removed

- **Bundled Scientist skill pack**: Removed the local `skills/scientist` bundle from the repository, including its bundled sub-skills and the Playwright coverage that depended on that local package.

## [0.1.36] - 2026-03-28

### Added

- **Marketplace search**: Added search in Settings → Skills Marketplace to filter official skill packs by name, slug, or description.
- **Skill version badges**: Added version display in Settings → Skills using the optional top-level `version` field from each skill's `SKILL.md` frontmatter.

## [0.1.35] - 2026-03-27

### Added

- **Skills Marketplace import**: Added Settings → Skills Marketplace listing/import support for official skill packs from `nahisaho/coreclaw-marketplace`.
- **Marketplace metadata support**: Added marketplace group metadata for bundled skills and repackaged consultant skill bundles for Marketplace compatibility.
- **Marketplace description popup**: Added an `info` button to Marketplace skill cards so each skill's description can be viewed in a popup before import.
- **Skill version display**: Added version badges in Settings → Skills using the optional top-level `version` field from each skill's `SKILL.md` frontmatter.

### Fixed

- **CoreClaw self-update failure**: The Settings → Updates flow now auto-cleans `package-lock.json` before `git pull` and blocks with a clear message when other tracked local changes would make the update unsafe.

## [0.1.34] - 2026-03-27

### Changed

- **Progress UI simplified**: Removed the lower duplicate task-progress row so active runs are shown only in the main Agent Status Panel.
- **Playwright workflow improved**: Added focused npm scripts for major Playwright groups and documented them in the README for faster targeted reruns.

### Verified

- **Long-running prompt coverage**: Mock WebSocket testing confirmed that long-running prompts complete correctly with progress restoration behavior intact.

## [0.1.33] - 2026-03-26

### Summary (v0.1.30–v0.1.32)

- **v0.1.30**: `agent_done` replay on WebSocket reconnect — prevents missed completion notifications.
- **v0.1.31**: Agent Status Panel (progress bar, step tracking, tool call chips, elapsed timer).
- **v0.1.32**: Real-time status updates from container stderr (`agent_status` events).

---

## [0.1.32] - 2026-03-26

### Fixed

- **Agent Status Panel stuck at "エージェント起動中..."** — The container agent produces output only once at the end of execution (via `OUTPUT_START_MARKER`/`OUTPUT_END_MARKER`), so no `agent_chunk` events arrive during the 5–10 minute run. The status panel was stuck because it only updated on chunk arrival. Fixed by streaming the container's stderr (`[agent-runner]` log lines) to the client as `agent_status` WebSocket events in real-time:
  - **Server**: `AgentRunner` now accepts an `onStatus` callback. In `src/index.ts`, the `onProcess` callback attaches to `proc.stderr` and forwards `[agent-runner]` lines via `onStatus()`. In `web-server.ts`, `onStatus` broadcasts `{ type: 'agent_status', taskId, status }`.
  - **Client**: New `case 'agent_status'` in the WebSocket handler calls `updateStatusPanelLine(taskId, line)`. Status lines are mapped to user-friendly Japanese labels: `📥 入力を受信、準備中...` → `🔄 クエリ実行中...` → `🤖 Copilot 処理中...` → `✅ クエリ完了、結果を整理中...`.

---

## [0.1.31] - 2026-03-26

### Added

- **Agent Status Panel** — A live status panel is now displayed inside the streaming message bubble while an agent task is running. It shows:
  - **Progress bar**: Determinate (`Step X/Y` detected → fills to `X/Y × 100%`) or animated indeterminate shimmer when no step count is available.
  - **Current step text**: Parses `## Step N:`, `**Step N/M: ...**`, and `Step N of M:` patterns from the streamed output and displays `Step N/M` badge + description.
  - **Tool call chips**: Detects MCP tool names in backtick notation (e.g. `` `PubMed_search_articles` ``) and 30+ known database names (PubMed, OpenAlex, EuropePMC, Crossref, ArXiv, SemanticScholar, AlphaFold, etc.) mentioned in the output. Each detected tool appears as a chip; the most recently seen tool is highlighted in accent color.
  - **Elapsed timer**: Shows running time (`0s`, `1m 30s`, etc.) updated every second from `agent_start`.
  - Panel appears immediately on `agent_start` (not delayed until first chunk). `showStatusPanel()` is idempotent and also called on `list_tasks` recovery after reload.
  The panel disappears automatically when the agent completes, errors, or is cancelled.

---

## [0.1.30] - 2026-03-25

### Fixed

- **Background agent `agent_done` notification not delivered after WebSocket reconnect** — When a long-running background agent completed while the browser's WebSocket connection was temporarily disconnected, the `agent_done` event was broadcast only once and lost. Fixed by two complementary changes:
  1. **Server**: Stores the completed message as `finalMessage` on the `ActiveTask` record. When a client re-subscribes to an experiment (via `subscribe` event — sent on WebSocket reconnect and when switching experiments), the server immediately replays `agent_done` for any recently-completed tasks that have a `finalMessage`.
  2. **Client**: The `tasks` response handler now also checks for `status === 'done'` tasks with a `finalMessage` and renders them if not already shown. A `data-msg-id` attribute is set on all rendered message elements so duplicate detection works correctly.

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
