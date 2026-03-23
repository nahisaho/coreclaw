/**
 * Experiment management for CoreClaw.
 * Each experiment is a thread with its own directory for artifacts.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import { DATA_DIR, GROUPS_DIR } from './config.js';
import { logger } from './logger.js';

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

export function updateMessageContent(msgId: string, content: string): void {
  getDb()
    .prepare('UPDATE experiment_messages SET content = ? WHERE id = ?')
    .run(content, msgId);
}

export function deleteMessage(msgId: string): void {
  getDb()
    .prepare('DELETE FROM experiment_messages WHERE id = ?')
    .run(msgId);
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
