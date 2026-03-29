/**
 * Experiment management for CoreClaw.
 * Each experiment is a thread with its own directory for artifacts.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { DATA_DIR, GROUPS_DIR } from './config.js';
import { logger } from './logger.js';
import { initMemoryDb } from './memory.js';
import type { BenchmarkArtifactCheck, BenchmarkEvaluationResult } from './benchmark-runs.js';

export interface Experiment {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived' | 'completed';
  created_at: string;
  updated_at: string;
  created_by: string;
  sync_repo: string; // per-experiment sync repository (owner/repo)
  skill: string; // default skill name for this chat
  mcp_servers: string; // JSON array of enabled MCP server names (empty = all)
  pinned: number; // 1 = pinned to top of sidebar, 0 = normal
}

export interface ExperimentMessage {
  id: string;
  experiment_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: string;
  user_id?: string; // GitHub username of sender
}

export interface ExperimentProcessHistory {
  id: string;
  experimentId: string;
  prompt: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  startedAt: string;
  finishedAt?: string;
  _lastStatus?: string;
  _statusHistory?: { message: string; timestamp: string }[];
}

export interface ExperimentActivityEvent {
  id: string;
  experimentId: string;
  taskId: string;
  timestamp: string;
  category: 'task' | 'tool' | 'command' | 'file' | 'model' | 'system';
  action: string;
  message: string;
  raw?: string;
  taskPrompt?: string;
  toolName?: string;
  filePath?: string;
  command?: string;
  status?: string;
}

export interface BenchmarkRunManifest {
  runId: string;
  experimentId: string;
  taskId: string;
  mode?: 'canonical' | 'prompt-run' | 'skill-improvement';
  benchmarkDefinitionId?: string;
  benchmarkDefinitionTitle?: string;
  promptSource: string;
  promptLabel: string;
  promptText: string;
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  model?: string;
  skill?: string;
  enabledMcpServers?: string[];
  githubMcpTools?: string;
  containerImage?: string;
  copilotAuthSource?: string;
  skillImprovementNote?: string;
  skillSnapshotHash?: string;
  skillSnapshotFileCount?: number;
  skillSnapshotCapturedAt?: string;
}

export interface BenchmarkSkillSnapshotFile {
  path: string;
  sizeBytes: number;
  sha256: string;
  content: string;
}

export interface BenchmarkSkillSnapshot {
  runId: string;
  skillName: string;
  capturedAt: string;
  sha256: string;
  fileCount: number;
  files: BenchmarkSkillSnapshotFile[];
}

export interface BenchmarkRunRecord {
  manifest: BenchmarkRunManifest;
  artifactCheck: BenchmarkArtifactCheck | null;
  evaluation: BenchmarkEvaluationResult | null;
  skillSnapshot: BenchmarkSkillSnapshot | null;
}

// ---------------------------------------------------------------------------
// Database helpers (lazy‑initialized via initExperimentsDb)
// ---------------------------------------------------------------------------

import Database from 'better-sqlite3';

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) throw new Error('Experiments DB not initialized – call initExperimentsDb first');
  return db;
}

export function initExperimentsDb(database: Database.Database): void {
  db = database;

  db.exec(`
    CREATE TABLE IF NOT EXISTS experiments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_by TEXT DEFAULT '',
      sync_repo TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS experiment_messages (
      id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      metadata TEXT,
      user_id TEXT DEFAULT '',
      FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_exp_msg_exp ON experiment_messages(experiment_id);
    CREATE INDEX IF NOT EXISTS idx_exp_msg_ts ON experiment_messages(timestamp);

    CREATE TABLE IF NOT EXISTS experiment_process_history (
      task_id TEXT PRIMARY KEY,
      experiment_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      last_status TEXT DEFAULT '',
      status_history TEXT DEFAULT '[]',
      FOREIGN KEY (experiment_id) REFERENCES experiments(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_exp_proc_hist_exp ON experiment_process_history(experiment_id, started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_exp_proc_hist_status ON experiment_process_history(status);
  `);

  // Migrations
  const expCols = db.prepare("PRAGMA table_info('experiments')").all() as { name: string }[];
  if (!expCols.find(c => c.name === 'created_by')) {
    db.exec("ALTER TABLE experiments ADD COLUMN created_by TEXT DEFAULT ''");
  }
  if (!expCols.find(c => c.name === 'sync_repo')) {
    db.exec("ALTER TABLE experiments ADD COLUMN sync_repo TEXT DEFAULT ''");
  }
  if (!expCols.find(c => c.name === 'skill')) {
    db.exec("ALTER TABLE experiments ADD COLUMN skill TEXT DEFAULT ''");
  }
  if (!expCols.find(c => c.name === 'mcp_servers')) {
    db.exec("ALTER TABLE experiments ADD COLUMN mcp_servers TEXT DEFAULT ''");
  }
  if (!expCols.find(c => c.name === 'pinned')) {
    db.exec("ALTER TABLE experiments ADD COLUMN pinned INTEGER DEFAULT 0");
  }
  const msgCols = db.prepare("PRAGMA table_info('experiment_messages')").all() as { name: string }[];
  if (!msgCols.find(c => c.name === 'user_id')) {
    db.exec("ALTER TABLE experiment_messages ADD COLUMN user_id TEXT DEFAULT ''");
  }
  const processHistoryCols = db.prepare("PRAGMA table_info('experiment_process_history')").all() as { name: string }[];
  if (!processHistoryCols.find(c => c.name === 'last_status')) {
    db.exec("ALTER TABLE experiment_process_history ADD COLUMN last_status TEXT DEFAULT ''");
  }
  if (!processHistoryCols.find(c => c.name === 'status_history')) {
    db.exec("ALTER TABLE experiment_process_history ADD COLUMN status_history TEXT DEFAULT '[]'");
  }

  // Initialize memory subsystem (same DB connection)
  initMemoryDb(database);
}

// ---------------------------------------------------------------------------
// Experiment CRUD
// ---------------------------------------------------------------------------

function experimentsDir(): string {
  return path.resolve(DATA_DIR, 'experiments');
}

function experimentDir(id: string): string {
  return path.join(experimentsDir(), id);
}

function benchmarkRunsDir(experimentId: string): string {
  const dir = path.join(experimentDir(experimentId), 'logs', 'benchmark-runs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

export function createExperiment(name: string, description = '', createdBy = '', syncRepo = '', skill = '', mcpServers = ''): Experiment {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const exp: Experiment = {
    id,
    name,
    description,
    status: 'active',
    created_at: now,
    updated_at: now,
    created_by: createdBy,
    sync_repo: syncRepo,
    skill,
    mcp_servers: mcpServers,
    pinned: 0,
  };

  getDb()
    .prepare(
      `INSERT INTO experiments (id, name, description, status, created_at, updated_at, created_by, sync_repo, skill, mcp_servers, pinned)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(exp.id, exp.name, exp.description, exp.status, exp.created_at, exp.updated_at, exp.created_by, exp.sync_repo, exp.skill, exp.mcp_servers, exp.pinned);

  // Create experiment artifacts directory
  const dir = experimentDir(id);
  fs.mkdirSync(path.join(dir, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });

  // Write experiment metadata to project folder
  const metadata = {
    id: exp.id,
    name: exp.name,
    description: exp.description,
    created_at: exp.created_at,
    created_by: exp.created_by,
  };
  fs.writeFileSync(path.join(dir, 'experiment.json'), JSON.stringify(metadata, null, 2) + '\n');
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    `# ${exp.name}\n\n${exp.description || '*No description*'}\n\n` +
    `- **ID**: ${exp.id}\n- **Created**: ${exp.created_at}\n` +
    (exp.created_by ? `- **Author**: ${exp.created_by}\n` : ''),
  );

  // Also write to group workspace (where the container works)
  const groupDir = path.join(GROUPS_DIR, `experiment-${id}`);
  fs.mkdirSync(groupDir, { recursive: true });
  fs.writeFileSync(path.join(groupDir, 'experiment.json'), JSON.stringify(metadata, null, 2) + '\n');
  fs.writeFileSync(
    path.join(groupDir, 'README.md'),
    `# ${exp.name}\n\n${exp.description || '*No description*'}\n\n` +
    `- **ID**: ${exp.id}\n- **Created**: ${exp.created_at}\n` +
    (exp.created_by ? `- **Author**: ${exp.created_by}\n` : ''),
  );

  logger.info({ id, name }, 'Experiment created');
  return exp;
}

export function getExperiment(id: string): Experiment | null {
  const row = getDb()
    .prepare('SELECT * FROM experiments WHERE id = ?')
    .get(id) as Experiment | undefined;
  return row ?? null;
}

export function listExperiments(
  status?: string,
): Experiment[] {
  if (status) {
    return getDb()
      .prepare('SELECT * FROM experiments WHERE status = ? ORDER BY pinned DESC, updated_at DESC')
      .all(status) as Experiment[];
  }
  return getDb()
    .prepare('SELECT * FROM experiments ORDER BY pinned DESC, updated_at DESC')
    .all() as Experiment[];
}

export function updateExperiment(
  id: string,
  updates: Partial<Pick<Experiment, 'name' | 'description' | 'status' | 'sync_repo' | 'skill' | 'mcp_servers' | 'pinned'>>,
): Experiment | null {
  const exp = getExperiment(id);
  if (!exp) return null;

  const name = updates.name ?? exp.name;
  const description = updates.description ?? exp.description;
  const status = updates.status ?? exp.status;
  const sync_repo = updates.sync_repo ?? exp.sync_repo;
  const skill = updates.skill ?? exp.skill;
  const mcp_servers = updates.mcp_servers ?? exp.mcp_servers;
  const pinned = updates.pinned ?? exp.pinned;
  const updated_at = new Date().toISOString();

  getDb()
    .prepare(
      'UPDATE experiments SET name = ?, description = ?, status = ?, sync_repo = ?, skill = ?, mcp_servers = ?, pinned = ?, updated_at = ? WHERE id = ?',
    )
    .run(name, description, status, sync_repo, skill, mcp_servers, pinned, updated_at, id);

  return { ...exp, name, description, status, sync_repo, skill, mcp_servers, pinned, updated_at };
}

export function deleteExperiment(id: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM experiments WHERE id = ?')
    .run(id);

  // Remove experiment directory
  const dir = experimentDir(id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export function addMessage(
  experimentId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  metadata?: Record<string, unknown>,
  userId?: string,
): ExperimentMessage {
  const msg: ExperimentMessage = {
    id: crypto.randomUUID(),
    experiment_id: experimentId,
    role,
    content,
    timestamp: new Date().toISOString(),
    metadata: metadata ? JSON.stringify(metadata) : undefined,
    user_id: userId,
  };

  getDb()
    .prepare(
      `INSERT INTO experiment_messages (id, experiment_id, role, content, timestamp, metadata, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(msg.id, msg.experiment_id, msg.role, msg.content, msg.timestamp, msg.metadata ?? null, msg.user_id ?? '');

  getDb()
    .prepare('UPDATE experiments SET updated_at = ? WHERE id = ?')
    .run(msg.timestamp, experimentId);

  appendToLog(experimentId, msg);

  return msg;
}

/**
 * Append a message to the experiment's JSONL log file.
 * Each line is a JSON object: { id, role, content, timestamp, metadata }
 */
function appendToLog(experimentId: string, msg: ExperimentMessage): void {
  try {
    const logDir = path.join(experimentDir(experimentId), 'logs');
    fs.mkdirSync(logDir, { recursive: true });

    // JSONL log (machine-readable, one JSON per line)
    const jsonlPath = path.join(logDir, 'messages.jsonl');
    const logEntry = JSON.stringify({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      metadata: msg.metadata || null,
    });
    fs.appendFileSync(jsonlPath, logEntry + '\n');

    // Human-readable markdown log
    const mdPath = path.join(logDir, 'conversation.md');
    const ts = new Date(msg.timestamp).toLocaleString('ja-JP');
    const roleLabel = msg.role === 'user' ? '👤 User' : msg.role === 'assistant' ? '🤖 Assistant' : '⚙️ System';
    const header = fs.existsSync(mdPath) ? '' : `# Experiment Log\n\n`;
    fs.appendFileSync(mdPath, `${header}## ${roleLabel} — ${ts}\n\n${msg.content}\n\n---\n\n`);
  } catch (err) {
    logger.warn({ experimentId, err }, 'Failed to write message log');
  }
}

export function getMessages(
  experimentId: string,
  limit = 100,
  offset = 0,
): ExperimentMessage[] {
  return getDb()
    .prepare(
      `SELECT * FROM experiment_messages
       WHERE experiment_id = ?
       ORDER BY timestamp ASC
       LIMIT ? OFFSET ?`,
    )
    .all(experimentId, limit, offset) as ExperimentMessage[];
}

export function getMessageCount(experimentId: string): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) as count FROM experiment_messages WHERE experiment_id = ?')
    .get(experimentId) as { count: number };
  return row.count;
}

/**
 * Return the most recent `limit` messages for an experiment in chronological order.
 * Useful for building memory context without fetching the entire history.
 */
export function getRecentMessages(
  experimentId: string,
  limit = 10,
): ExperimentMessage[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM experiment_messages
       WHERE experiment_id = ?
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(experimentId, limit) as ExperimentMessage[];
  return rows.reverse(); // Return in chronological (ascending) order
}

/**
 * Return messages by ascending offset after a given row count.
 * Used to fetch the "unsummarized" messages for the compaction prompt.
 */
export function getMessagesFromOffset(
  experimentId: string,
  offset: number,
  limit = 500,
): ExperimentMessage[] {
  return getDb()
    .prepare(
      `SELECT * FROM experiment_messages
       WHERE experiment_id = ?
       ORDER BY timestamp ASC
       LIMIT ? OFFSET ?`,
    )
    .all(experimentId, limit, offset) as ExperimentMessage[];
}

export function updateMessageContent(msgId: string, content: string): void {
  getDb()
    .prepare('UPDATE experiment_messages SET content = ?, metadata = NULL WHERE id = ?')
    .run(content, msgId);
}

/**
 * Full-text search across messages of a single experiment.
 * Returns matching messages sorted by timestamp ascending, limited to 200 results.
 */
export function searchMessages(
  experimentId: string,
  query: string,
  limit = 200,
): ExperimentMessage[] {
  return getDb()
    .prepare(
      `SELECT * FROM experiment_messages
       WHERE experiment_id = ? AND content LIKE ? AND role IN ('user', 'assistant')
       ORDER BY timestamp ASC
       LIMIT ?`,
    )
    .all(experimentId, `%${query}%`, limit) as ExperimentMessage[];
}


export function deleteMessage(msgId: string): void {
  getDb()
    .prepare('DELETE FROM experiment_messages WHERE id = ?')
    .run(msgId);
}

export function upsertProcessHistory(entry: ExperimentProcessHistory): void {
  getDb()
    .prepare(
      `INSERT INTO experiment_process_history (task_id, experiment_id, prompt, status, started_at, finished_at, last_status, status_history)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(task_id) DO UPDATE SET
         experiment_id = excluded.experiment_id,
         prompt = excluded.prompt,
         status = excluded.status,
         started_at = excluded.started_at,
         finished_at = excluded.finished_at,
         last_status = excluded.last_status,
         status_history = excluded.status_history`,
    )
    .run(
      entry.id,
      entry.experimentId,
      entry.prompt,
      entry.status,
      entry.startedAt,
      entry.finishedAt ?? null,
      entry._lastStatus ?? '',
      JSON.stringify(entry._statusHistory ?? []),
    );
}

export function deleteProcessHistory(taskId: string): void {
  getDb()
    .prepare('DELETE FROM experiment_process_history WHERE task_id = ?')
    .run(taskId);
}

export function appendTerminalProcessLog(
  experimentId: string,
  entry: ExperimentProcessHistory,
  note = '',
): void {
  try {
    const logDir = path.join(experimentDir(experimentId), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const jsonlPath = path.join(logDir, 'process-history.jsonl');
    fs.appendFileSync(
      jsonlPath,
      JSON.stringify({
        taskId: entry.id,
        experimentId,
        prompt: entry.prompt,
        status: entry.status,
        startedAt: entry.startedAt,
        finishedAt: entry.finishedAt ?? null,
        lastStatus: entry._lastStatus ?? '',
        statusHistory: entry._statusHistory ?? [],
        note,
        timestamp: new Date().toISOString(),
      }) + '\n',
    );
  } catch (err) {
    logger.warn({ experimentId, err }, 'Failed to write process history log');
  }
}

export function appendActivityEvent(event: ExperimentActivityEvent): void {
  try {
    const logDir = path.join(experimentDir(event.experimentId), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const jsonlPath = path.join(logDir, 'activity-events.jsonl');
    fs.appendFileSync(jsonlPath, JSON.stringify(event) + '\n');
  } catch (err) {
    logger.warn({ experimentId: event.experimentId, err }, 'Failed to write activity event');
  }
}

export function listActivityEvents(
  experimentId: string,
  limit = 500,
): ExperimentActivityEvent[] {
  try {
    const jsonlPath = path.join(experimentDir(experimentId), 'logs', 'activity-events.jsonl');
    if (!fs.existsSync(jsonlPath)) return [];

    const lines = fs.readFileSync(jsonlPath, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const events: ExperimentActivityEvent[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as Partial<ExperimentActivityEvent>;
        if (
          typeof parsed.id === 'string'
          && typeof parsed.experimentId === 'string'
          && typeof parsed.taskId === 'string'
          && typeof parsed.timestamp === 'string'
          && typeof parsed.category === 'string'
          && typeof parsed.action === 'string'
          && typeof parsed.message === 'string'
        ) {
          events.push(parsed as ExperimentActivityEvent);
        }
      } catch {
        // Ignore malformed lines so one bad entry does not break the view.
      }
    }

    return events
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime())
      .slice(0, limit);
  } catch (err) {
    logger.warn({ experimentId, err }, 'Failed to read activity events');
    return [];
  }
}

export function appendCompletedProcessHistory(
  experimentId: string,
  entry: ExperimentProcessHistory,
  response: string,
): void {
  try {
    const wsDir = getWorkspaceDir(experimentId);
    fs.mkdirSync(wsDir, { recursive: true });
    const historyPath = path.join(wsDir, 'HISTORY.md');
    const header = fs.existsSync(historyPath) ? '' : '# History\n\n';
    const started = new Date(entry.startedAt).toLocaleString('ja-JP');
    const finished = entry.finishedAt
      ? new Date(entry.finishedAt).toLocaleString('ja-JP')
      : '—';
    const prompt = (entry.prompt || '').trim() || '(empty prompt)';
    const body = (response || '').trim() || '(empty response)';
    const statusHistory = (entry._statusHistory ?? []).filter(item => item?.message && item?.timestamp);
    const processSection = statusHistory.length
      ? '### Process\n\n' + statusHistory
        .map(item => `- ${new Date(item.timestamp).toLocaleString('ja-JP')}: ${item.message}`)
        .join('\n') + '\n\n'
      : '';

    fs.appendFileSync(
      historyPath,
      `${header}## ${finished}\n\n` +
      `- Task ID: ${entry.id}\n` +
      `- Started: ${started}\n` +
      `- Finished: ${finished}\n\n` +
      `### Prompt\n\n${prompt}\n\n` +
      processSection +
      `### Response\n\n${body}\n\n---\n\n`,
    );
  } catch (err) {
    logger.warn({ experimentId, err }, 'Failed to write completed process history');
  }
}

export function listProcessHistory(
  experimentId: string,
  limit = 200,
): ExperimentProcessHistory[] {
  const rows = getDb()
    .prepare(
      `SELECT task_id, experiment_id, prompt, status, started_at, finished_at, last_status, status_history
       FROM experiment_process_history
       WHERE experiment_id = ? AND status = 'running'
       ORDER BY started_at DESC
       LIMIT ?`,
    )
    .all(experimentId, limit) as {
      task_id: string;
      experiment_id: string;
      prompt: string;
      status: 'running' | 'error' | 'cancelled';
      started_at: string;
      finished_at: string | null;
      last_status: string | null;
      status_history: string | null;
    }[];

  return rows.map((row) => ({
    id: row.task_id,
    experimentId: row.experiment_id,
    prompt: row.prompt,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    _lastStatus: row.last_status ?? '',
    _statusHistory: (() => {
      try {
        const parsed = JSON.parse(row.status_history || '[]');
        return Array.isArray(parsed)
          ? parsed.filter(item => item && typeof item.message === 'string' && typeof item.timestamp === 'string')
          : [];
      } catch {
        return [];
      }
    })(),
  }));
}

export function drainStaleRunningProcessHistory(): number {
  const now = new Date().toISOString();
  const rows = getDb()
    .prepare(
      `SELECT task_id, experiment_id, prompt, status, started_at, finished_at, last_status, status_history
       FROM experiment_process_history
       WHERE status = 'running'`,
    )
    .all() as {
      task_id: string;
      experiment_id: string;
      prompt: string;
      status: 'running';
      started_at: string;
      finished_at: string | null;
      last_status: string | null;
      status_history: string | null;
    }[];

  for (const row of rows) {
    appendTerminalProcessLog(
      row.experiment_id,
      {
        id: row.task_id,
        experimentId: row.experiment_id,
        prompt: row.prompt,
        status: 'cancelled',
        startedAt: row.started_at,
        finishedAt: row.finished_at ?? now,
        _lastStatus: row.last_status || 'CoreClaw restarted before this process finished.',
        _statusHistory: (() => {
          try {
            const parsed = JSON.parse(row.status_history || '[]');
            return Array.isArray(parsed)
              ? parsed.filter(item => item && typeof item.message === 'string' && typeof item.timestamp === 'string')
              : [];
          } catch {
            return [];
          }
        })(),
      },
      'CoreClaw restarted before this process finished.',
    );
  }

  getDb()
    .prepare("DELETE FROM experiment_process_history WHERE status = 'running'")
    .run();

  return rows.length;
}

// ---------------------------------------------------------------------------
// Artifacts — searches both data/experiments/{id}/artifacts/ and groups/experiment-{id}/
// ---------------------------------------------------------------------------

/** Return the primary artifacts directory (under data/experiments/). */
export function getArtifactsDir(experimentId: string): string {
  const dir = path.join(experimentDir(experimentId), 'artifacts');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Return the container workspace directory (under groups/). */
function getWorkspaceDir(experimentId: string): string {
  return path.join(GROUPS_DIR, `experiment-${experimentId}`);
}

export function saveArtifact(
  experimentId: string,
  filename: string,
  content: string | Buffer,
): string {
  const dir = getArtifactsDir(experimentId);
  const filePath = path.join(dir, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
  logger.debug({ experimentId, filename }, 'Artifact saved');
  return filePath;
}

export function writeBenchmarkRunManifest(
  experimentId: string,
  runId: string,
  manifest: BenchmarkRunManifest,
): void {
  fs.writeFileSync(
    path.join(benchmarkRunsDir(experimentId), `${runId}.json`),
    JSON.stringify(manifest, null, 2) + '\n',
  );
}

export function writeBenchmarkArtifactCheck(
  experimentId: string,
  runId: string,
  payload: unknown,
): void {
  fs.writeFileSync(
    path.join(benchmarkRunsDir(experimentId), `${runId}.artifacts.json`),
    JSON.stringify(payload, null, 2) + '\n',
  );
}

export function writeBenchmarkEvaluationResult(
  experimentId: string,
  runId: string,
  payload: unknown,
): void {
  fs.writeFileSync(
    path.join(benchmarkRunsDir(experimentId), `${runId}.evaluation.json`),
    JSON.stringify(payload, null, 2) + '\n',
  );
}

export function writeBenchmarkSkillSnapshot(
  experimentId: string,
  runId: string,
  payload: unknown,
): void {
  fs.writeFileSync(
    path.join(benchmarkRunsDir(experimentId), `${runId}.skill.json`),
    JSON.stringify(payload, null, 2) + '\n',
  );
}

export function listBenchmarkRuns(experimentId: string): BenchmarkRunRecord[] {
  const dir = benchmarkRunsDir(experimentId);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((entry) => entry.endsWith('.json') && !entry.endsWith('.artifacts.json') && !entry.endsWith('.evaluation.json'))
    .map((entry) => {
      const manifest = readJsonFile<BenchmarkRunManifest>(path.join(dir, entry));
      if (!manifest) return null;

      return {
        manifest,
        artifactCheck: readJsonFile<BenchmarkArtifactCheck>(path.join(dir, `${manifest.runId}.artifacts.json`)),
        evaluation: readJsonFile<BenchmarkEvaluationResult>(path.join(dir, `${manifest.runId}.evaluation.json`)),
        skillSnapshot: readJsonFile<BenchmarkSkillSnapshot>(path.join(dir, `${manifest.runId}.skill.json`)),
      };
    })
    .filter((record): record is BenchmarkRunRecord => record !== null)
    .sort((left, right) => {
      const rightTime = Date.parse(right.manifest.startedAt || right.manifest.finishedAt || '') || 0;
      const leftTime = Date.parse(left.manifest.startedAt || left.manifest.finishedAt || '') || 0;
      return rightTime - leftTime;
    });
}

function walkDir(dirPath: string, prefix: string, results: string[]): void {
  if (!fs.existsSync(dirPath)) return;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    // Skip logs, .copilot, .github, node_modules
    if (['.copilot', '.github', 'node_modules', 'agent-runner-src', '__pycache__'].includes(entry.name)) continue;
    // Skip container run log files (container-*.log) but keep other log content
    if (entry.isFile() && entry.name.match(/^container-.*\.log$/)) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkDir(path.join(dirPath, entry.name), rel, results);
    } else {
      results.push(rel);
    }
  }
}

export function listArtifacts(experimentId: string): string[] {
  const results: string[] = [];

  // 1. Primary artifacts directory
  const artifactsDir = getArtifactsDir(experimentId);
  walkDir(artifactsDir, '', results);

  // 2. Container workspace (groups/experiment-{id}/)
  const wsDir = getWorkspaceDir(experimentId);
  walkDir(wsDir, '', results);

  // Deduplicate
  return [...new Set(results)].sort();
}

/**
 * Resolve an artifact file path — checks both artifacts dir and workspace dir.
 */
export function resolveArtifactPath(experimentId: string, relativePath: string): string | null {
  // Security: prevent path traversal
  if (relativePath.includes('..')) return null;

  // Check primary artifacts dir first
  const artifactPath = path.join(getArtifactsDir(experimentId), relativePath);
  if (fs.existsSync(artifactPath) && fs.statSync(artifactPath).isFile()) {
    return artifactPath;
  }

  // Check workspace dir
  const wsPath = path.join(getWorkspaceDir(experimentId), relativePath);
  if (fs.existsSync(wsPath) && fs.statSync(wsPath).isFile()) {
    return wsPath;
  }

  return null;
}

export function getArtifactSizeBytes(experimentId: string, relativePath: string): number {
  const resolvedPath = resolveArtifactPath(experimentId, relativePath);
  if (!resolvedPath) return 0;
  try {
    return fs.statSync(resolvedPath).size;
  } catch {
    return 0;
  }
}
