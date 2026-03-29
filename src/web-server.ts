/**
 * Web server for CoreClaw.
 * Provides REST API for experiment/chat management and WebSocket for streaming.
 */
import { createServer, IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

import { WebSocketServer, WebSocket } from 'ws';

import { logger } from './logger.js';
import {
  initExperimentsDb,
  createExperiment,
  type ExperimentActivityEvent,
  type BenchmarkRunManifest,
  type BenchmarkSkillSnapshot,
  getExperiment,
  listExperiments,
  updateExperiment,
  deleteExperiment,
  addMessage,
  getMessages,
  getMessageCount,
  getRecentMessages,
  getMessagesFromOffset,
  updateMessageContent,
  deleteMessage,
  searchMessages,
  listArtifacts,
  appendCompletedProcessHistory,
  appendActivityEvent,
  appendTerminalProcessLog,
  drainStaleRunningProcessHistory,
  listActivityEvents,
  listBenchmarkRuns,
  listProcessHistory,
  upsertProcessHistory,
  deleteProcessHistory,
  getArtifactsDir,
  saveArtifact,
  resolveArtifactPath,
  writeBenchmarkRunManifest,
  writeBenchmarkArtifactCheck,
  writeBenchmarkEvaluationResult,
  writeBenchmarkSkillSnapshot,
  getArtifactSizeBytes,
} from './experiments.js';
import {
  getMemory,
  clearMemory,
  buildMemoryContext,
  needsSummarization,
  buildSummarizationPrompt,
  setMemorySummary,
  MEMORY_RECENT_PAIRS,
} from './memory.js';
import { getDatabase } from './db.js';
import { DATA_DIR, GROUPS_DIR } from './config.js';
import {
  getMarketplaceImportMetadata,
  getSkillMetadata,
  importMarketplaceSkillGroup,
  isMarketplaceImportedSkill,
  listAvailableSkills,
  listMarketplaceSkillGroups,
} from './skills-sync.js';
import { syncExperiment, pullExperiment } from './github-sync.js';
import { execSync, spawn, spawnSync } from 'child_process';
import { classifyUpdaterDirtyFiles, parseDirtyTrackedFiles } from './update-utils.js';
import { createDeflateRaw, inflateRawSync } from 'zlib';
import { checkCopilotAuthStatus, resolveGitHubToken, type CopilotAuthStatus } from './github-auth.js';
import {
  buildBenchmarkArtifactCheck,
  buildBenchmarkEvaluationResult,
  getBenchmarkDefinitionById,
  loadBenchmarkDefinitions,
  matchBenchmarkDefinition,
} from './benchmark-runs.js';
import { CONTAINER_IMAGE } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COPILOT_AUTH_STATUS_TTL_MS = 60_000;

let cachedCopilotAuthStatus: CopilotAuthStatus = {
  ok: false,
  state: 'checking',
  source: 'none',
  message: 'GitHub Copilot 認証状態を確認中です。',
  checkedAt: new Date(0).toISOString(),
};
let copilotAuthStatusCheckedAt = 0;
let copilotAuthStatusPromise: Promise<CopilotAuthStatus> | null = null;

async function getCachedCopilotAuthStatus(force = false): Promise<CopilotAuthStatus> {
  const now = Date.now();
  if (
    !force
    && copilotAuthStatusCheckedAt > 0
    && now - copilotAuthStatusCheckedAt < COPILOT_AUTH_STATUS_TTL_MS
    && cachedCopilotAuthStatus.state !== 'checking'
  ) {
    return cachedCopilotAuthStatus;
  }

  if (copilotAuthStatusPromise) {
    return copilotAuthStatusPromise;
  }

  copilotAuthStatusPromise = checkCopilotAuthStatus()
    .then((status) => {
      cachedCopilotAuthStatus = status;
      copilotAuthStatusCheckedAt = Date.now();
      if (status.ok) {
        logger.info({ source: status.source }, 'Copilot auth precheck succeeded');
      } else {
        logger.warn({ state: status.state, source: status.source, detail: status.detail }, status.message);
      }
      return status;
    })
    .catch((err) => {
      cachedCopilotAuthStatus = {
        ok: false,
        state: 'error',
        source: 'none',
        message: 'GitHub 認証状態の確認に失敗しました。',
        detail: err instanceof Error ? err.message : String(err),
        checkedAt: new Date().toISOString(),
      };
      copilotAuthStatusCheckedAt = Date.now();
      logger.warn({ err }, 'Copilot auth precheck failed');
      return cachedCopilotAuthStatus;
    })
    .finally(() => {
      copilotAuthStatusPromise = null;
    });

  return copilotAuthStatusPromise;
}

// ---------------------------------------------------------------------------
// Settings persistence (stored in data/settings.json, outside project root)
// ---------------------------------------------------------------------------

const SETTINGS_KEYS = [
  'github_token',
  'copilot_model',
  'github_mcp_tools',
  'output_language',
  'ai_provider',
  'openai_api_key',
  'azure_openai_api_key',
  'azure_openai_endpoint',
  'ollama_url',
  'ollama_model',
  'github_username',
  'mcp_servers',
] as const;

type SettingsMap = Record<string, string>;

function sanitizeMcpServersValue(value: unknown): string {
  let parsed: unknown[] = [];
  if (typeof value === 'string') {
    if (!value.trim()) return '';
    try {
      parsed = JSON.parse(value);
    } catch {
      return '';
    }
  } else if (Array.isArray(value)) {
    parsed = value;
  } else {
    return '';
  }

  const seenNames = new Set<string>();
  const deduped = parsed
    .filter((server): server is Record<string, unknown> => !!server && typeof server === 'object')
    .map((server) => ({
      name: String(server.name || '').trim(),
      type: String(server.type || 'stdio').trim() || 'stdio',
      command: String(server.command || '').trim(),
      args: String(server.args || '').trim(),
      env: String(server.env || '').trim(),
    }))
    .filter((server) => {
      if (!server.name || !server.command) return false;
      const key = server.name.toLowerCase();
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });

  return deduped.length > 0 ? JSON.stringify(deduped) : '';
}

function sanitizeSettingsMap(settings: Record<string, unknown>): SettingsMap {
  const sanitized: SettingsMap = {};
  for (const key of SETTINGS_KEYS) {
    const value = settings[key];
    if (value === undefined) continue;
    sanitized[key] = key === 'mcp_servers'
      ? sanitizeMcpServersValue(value)
      : typeof value === 'string'
        ? value
        : String(value ?? '');
  }
  return sanitized;
}

function buildOutputLanguageInstruction(outputLanguage: string): string {
  switch ((outputLanguage || '').trim().toLowerCase()) {
    case 'en':
    case 'english':
      return 'Respond in English for the final answer unless the user explicitly requests another language.';
    case 'ja':
    case 'japanese':
    default:
      return 'Respond in Japanese for the final answer unless the user explicitly requests another language.';
  }
}

function settingsPath(): string {
  return path.join(DATA_DIR, 'settings.json');
}

function loadSettings(): SettingsMap {
  const p = settingsPath();
  if (!fs.existsSync(p)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const sanitized = sanitizeSettingsMap(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(sanitized)) {
      saveSettings(sanitized);
    }
    return sanitized;
  } catch {
    return {};
  }
}

function saveSettings(settings: SettingsMap): void {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), { mode: 0o600 });
}

// ---------------------------------------------------------------------------
// Scan whitelist persistence (stored in data/scan-whitelist.json)
// ---------------------------------------------------------------------------

type ScanWhitelist = Record<string, string[]>; // skillName -> array of "file:label" keys
const MARKETPLACE_IMPORT_METADATA_FILE = '.coreclaw-marketplace.json';

function scanWhitelistPath(): string {
  return path.join(DATA_DIR, 'scan-whitelist.json');
}

function loadScanWhitelist(): ScanWhitelist {
  const p = scanWhitelistPath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch {
    return {};
  }
}

function saveScanWhitelist(wl: ScanWhitelist): void {
  fs.mkdirSync(path.dirname(scanWhitelistPath()), { recursive: true });
  fs.writeFileSync(scanWhitelistPath(), JSON.stringify(wl, null, 2));
}

function parseVersion(version: string): number[] {
  return String(version || '')
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function isVersionNewer(candidate: string, current: string): boolean {
  const left = parseVersion(candidate);
  const right = parseVersion(current);
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;
    if (leftPart > rightPart) return true;
    if (leftPart < rightPart) return false;
  }

  return false;
}

async function getMarketplaceSkillStatus(
  skillName: string,
  marketplaceGroups?: Awaited<ReturnType<typeof listMarketplaceSkillGroups>>,
): Promise<{
  marketplaceImported: boolean;
  marketplaceSlug: string;
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
}> {
  const skillDir = path.resolve(process.cwd(), 'skills', skillName);
  const localMeta = getSkillMetadata(skillName);
  const importMeta = getMarketplaceImportMetadata(skillName);
  let marketplaceImported = isMarketplaceImportedSkill(skillName);
  const currentVersion = marketplaceImported
    ? (importMeta?.version || localMeta?.version || '')
    : (localMeta?.version || importMeta?.version || '');
  let latestVersion = '';
  let marketplaceSlug = importMeta?.slug || skillName;

  try {
    const groups = marketplaceGroups ?? await listMarketplaceSkillGroups();
    const marketplaceGroup = groups.find((group) => group.slug === marketplaceSlug);
    if (marketplaceGroup) {
      latestVersion = marketplaceGroup.version || '';
      marketplaceImported = marketplaceImported || fs.existsSync(path.join(skillDir, 'group.json'));
      marketplaceSlug = marketplaceGroup.slug;
    }
  } catch (err) {
    logger.warn({ skill: skillName, err }, 'Failed to resolve marketplace status for local skill');
  }

  return {
    marketplaceImported,
    marketplaceSlug,
    currentVersion: currentVersion || (marketplaceImported ? latestVersion : ''),
    latestVersion,
    updateAvailable: Boolean(currentVersion && latestVersion && isVersionNewer(latestVersion, currentVersion)),
  };
}

// ---------------------------------------------------------------------------
// File upload helpers
// ---------------------------------------------------------------------------

interface MultipartFile {
  filename: string;
  contentType: string;
  data: Buffer;
}

function getUploadDir(experimentId: string): string {
  const dir = path.join(GROUPS_DIR, `experiment-${experimentId}`, 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function parseMultipart(body: Buffer, boundary: string): MultipartFile[] {
  const files: MultipartFile[] = [];
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(body, boundaryBuf);

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;

    const headers = part.subarray(0, headerEnd).toString();
    const data = part.subarray(headerEnd + 4);
    // Trim trailing \r\n
    const trimmed = data.subarray(0, data.length - 2);

    // Try RFC 5987 filename*=UTF-8''... first, fall back to filename="..."
    const filenameStar = headers.match(/filename\*=UTF-8''([^\s;]+)/i);
    const filenameQuoted = headers.match(/filename="([^"]+)"/);
    const filename = filenameStar
      ? decodeURIComponent(filenameStar[1])
      : filenameQuoted?.[1];
    const ctMatch = headers.match(/Content-Type:\s*(.+)/i);

    if (filename) {
      files.push({
        filename,
        contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
        data: trimmed,
      });
    }
  }
  return files;
}

function splitBuffer(buf: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  while (true) {
    const idx = buf.indexOf(delimiter, start);
    if (idx === -1) {
      if (start < buf.length) parts.push(buf.subarray(start));
      break;
    }
    if (idx > start) parts.push(buf.subarray(start, idx));
    start = idx + delimiter.length;
  }
  return parts;
}

// ---------------------------------------------------------------------------
// ZIP file builder (minimal, no dependencies)
// ---------------------------------------------------------------------------

function buildZip(files: { name: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf-8');
    const crc = crc32(file.data);
    const size = file.data.length;

    // Local file header (store, no compression for simplicity)
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);   // signature
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0, 6);             // flags
    local.writeUInt16LE(0, 8);             // compression: store
    local.writeUInt16LE(0, 10);            // mod time
    local.writeUInt16LE(0, 12);            // mod date
    local.writeUInt32LE(crc, 14);          // crc32
    local.writeUInt32LE(size, 18);         // compressed size
    local.writeUInt32LE(size, 22);         // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26); // filename length
    local.writeUInt16LE(0, 28);            // extra field length
    nameBytes.copy(local, 30);

    parts.push(local, file.data);

    // Central directory entry
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);  // signature
    central.writeUInt16LE(20, 4);           // version made by
    central.writeUInt16LE(20, 6);           // version needed
    central.writeUInt16LE(0, 8);            // flags
    central.writeUInt16LE(0, 10);           // compression
    central.writeUInt16LE(0, 12);           // mod time
    central.writeUInt16LE(0, 14);           // mod date
    central.writeUInt32LE(crc, 16);         // crc32
    central.writeUInt32LE(size, 20);        // compressed
    central.writeUInt32LE(size, 24);        // uncompressed
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);           // extra
    central.writeUInt16LE(0, 32);           // comment
    central.writeUInt16LE(0, 34);           // disk start
    central.writeUInt16LE(0, 36);           // internal attrs
    central.writeUInt32LE(0, 38);           // external attrs
    central.writeUInt32LE(offset, 42);      // local header offset
    nameBytes.copy(central, 46);

    centralDir.push(central);
    offset += local.length + file.data.length;
  }

  const centralDirBuf = Buffer.concat(centralDir);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);        // signature
  eocd.writeUInt16LE(0, 4);                 // disk
  eocd.writeUInt16LE(0, 6);                 // disk with cd
  eocd.writeUInt16LE(files.length, 8);      // entries on disk
  eocd.writeUInt16LE(files.length, 10);     // total entries
  eocd.writeUInt32LE(centralDirBuf.length, 12); // cd size
  eocd.writeUInt32LE(offset, 16);           // cd offset
  eocd.writeUInt16LE(0, 20);               // comment length

  return Buffer.concat([...parts, centralDirBuf, eocd]);
}

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Extract files from a ZIP buffer (minimal reader, no dependencies).
 */
function extractZip(zipBuf: Buffer): { name: string; data: Buffer }[] {
  const files: { name: string; data: Buffer }[] = [];
  let offset = 0;

  while (offset < zipBuf.length - 4) {
    const sig = zipBuf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // Not a local file header

    const compressionMethod = zipBuf.readUInt16LE(offset + 8);
    const compressedSize = zipBuf.readUInt32LE(offset + 18);
    const uncompressedSize = zipBuf.readUInt32LE(offset + 22);
    const nameLen = zipBuf.readUInt16LE(offset + 26);
    const extraLen = zipBuf.readUInt16LE(offset + 28);

    const nameStart = offset + 30;
    const name = zipBuf.subarray(nameStart, nameStart + nameLen).toString('utf-8');
    const dataStart = nameStart + nameLen + extraLen;
    const rawData = zipBuf.subarray(dataStart, dataStart + compressedSize);

    // Skip directories
    if (!name.endsWith('/') && compressedSize > 0) {
      if (compressionMethod === 0) {
        files.push({ name, data: rawData });
      } else if (compressionMethod === 8) {
        try {
          files.push({ name, data: inflateRawSync(rawData) });
        } catch {
          // Skip if can't decompress
        }
      }
    }

    offset = dataStart + compressedSize;
  }

  return files;
}

// ---------------------------------------------------------------------------
// Agent execution callback — set by orchestrator
// ---------------------------------------------------------------------------

type AgentRunner = (
  experimentId: string,
  taskId: string,
  prompt: string,
  onChunk: (chunk: string) => void,
  onDone: (fullResponse: string) => void,
  onError: (error: string) => void,
  onStatus?: (statusLine: string) => void,
) => void;

type AgentStopper = (experimentId: string, taskId: string) => void;
type AppShutdown = (reason: string) => Promise<void>;
type AppRestart = (reason: string) => Promise<void>;

/**
 * Callback registered by the orchestrator to run a memory summarisation pass.
 * Called asynchronously after an agent response when the history is long enough.
 */
type MemorySummarizer = (
  experimentId: string,
  summarizationPrompt: string,
  onDone: (summary: string) => void,
  onError: (error: string) => void,
) => void;

let agentRunner: AgentRunner | null = null;
let agentStopper: AgentStopper | null = null;
let appShutdown: AppShutdown | null = null;
let appRestart: AppRestart | null = null;
let memorySummarizer: MemorySummarizer | null = null;

function buildActivityId(taskId: string): string {
  return `activity-${taskId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildTaskActivityEvent(
  task: ActiveTask,
  category: ExperimentActivityEvent['category'],
  action: string,
  message: string,
  extras: Partial<Omit<ExperimentActivityEvent, 'id' | 'experimentId' | 'taskId' | 'timestamp' | 'category' | 'action' | 'message'>> = {},
): ExperimentActivityEvent {
  return {
    id: buildActivityId(task.id),
    experimentId: task.experimentId,
    taskId: task.id,
    timestamp: new Date().toISOString(),
    category,
    action,
    message,
    ...extras,
  };
}

function persistAndBroadcastActivity(task: ActiveTask, event: ExperimentActivityEvent): void {
  appendActivityEvent(event);
  broadcastToExperiment(task.experimentId, {
    type: 'activity_event',
    event,
  });
}

function parseStatusLineActivity(task: ActiveTask, statusLine: string): ExperimentActivityEvent | null {
  if (!statusLine || statusLine === '__heartbeat__') return null;

  let match = statusLine.match(/^Model selected:\s+(.+)$/i);
  if (match) {
    return buildTaskActivityEvent(task, 'model', 'selected', `Model selected: ${match[1]}`, {
      raw: statusLine,
    });
  }

  match = statusLine.match(/^Executing command:\s+(.+)$/i);
  if (match) {
    return buildTaskActivityEvent(task, 'command', 'execute', `Executing command: ${match[1]}`, {
      raw: statusLine,
      command: match[1],
    });
  }

  match = statusLine.match(/^Command detail:\s+(.+)$/i);
  if (match) {
    return buildTaskActivityEvent(task, 'command', 'detail', `Command detail: ${match[1]}`, {
      raw: statusLine,
      command: match[1],
    });
  }

  match = statusLine.match(/^Reading file:\s+(.+)$/i);
  if (match) {
    return buildTaskActivityEvent(task, 'file', 'read', `Reading file: ${match[1]}`, {
      raw: statusLine,
      filePath: match[1],
    });
  }

  match = statusLine.match(/^Creating file:\s+(.+)$/i);
  if (match) {
    return buildTaskActivityEvent(task, 'file', 'create', `Creating file: ${match[1]}`, {
      raw: statusLine,
      filePath: match[1],
    });
  }

  match = statusLine.match(/^Creating directory:\s+(.+)$/i);
  if (match) {
    return buildTaskActivityEvent(task, 'file', 'mkdir', `Creating directory: ${match[1]}`, {
      raw: statusLine,
      filePath: match[1],
    });
  }

  match = statusLine.match(/^Updating file:\s+(.+)$/i);
  if (match) {
    return buildTaskActivityEvent(task, 'file', 'update', `Updating file: ${match[1]}`, {
      raw: statusLine,
      filePath: match[1],
    });
  }

  match = statusLine.match(/^Created file:\s+(.+)$/i);
  if (match) {
    return buildTaskActivityEvent(task, 'file', 'created', `Created file: ${match[1]}`, {
      raw: statusLine,
      filePath: match[1],
    });
  }

  match = statusLine.match(/^Modified file:\s+(.+)$/i);
  if (match) {
    return buildTaskActivityEvent(task, 'file', 'modified', `Modified file: ${match[1]}`, {
      raw: statusLine,
      filePath: match[1],
    });
  }

  match = statusLine.match(/^Deleted file:\s+(.+)$/i);
  if (match) {
    return buildTaskActivityEvent(task, 'file', 'deleted', `Deleted file: ${match[1]}`, {
      raw: statusLine,
      filePath: match[1],
    });
  }

  match = statusLine.match(/^Listing directory:\s+(.+)$/i);
  if (match) {
    return buildTaskActivityEvent(task, 'file', 'list', `Listing directory: ${match[1]}`, {
      raw: statusLine,
      filePath: match[1],
    });
  }

  match = statusLine.match(/^Checking errors:\s+(.+)$/i);
  if (match) {
    return buildTaskActivityEvent(task, 'tool', 'check_errors', `Checking errors: ${match[1]}`, {
      raw: statusLine,
      filePath: match[1],
      toolName: 'get_errors',
    });
  }

  match = statusLine.match(/^Calling\s+(.+?)(?::\s*(.+))?$/i);
  if (match) {
    return buildTaskActivityEvent(task, 'tool', 'start', statusLine, {
      raw: statusLine,
      toolName: match[1],
    });
  }

  match = statusLine.match(/^(Completed|Failed)\s+(.+)$/i);
  if (match) {
    return buildTaskActivityEvent(task, 'tool', match[1].toLowerCase() === 'completed' ? 'complete' : 'fail', statusLine, {
      raw: statusLine,
      toolName: match[2],
      status: match[1].toLowerCase() === 'completed' ? 'success' : 'error',
    });
  }

  if (statusLine === '__container_spawned__' || statusLine === 'Container starting') {
    return buildTaskActivityEvent(task, 'system', 'container_spawn', 'Container starting', {
      raw: statusLine,
    });
  }

  return buildTaskActivityEvent(task, 'system', 'status', statusLine, {
    raw: statusLine,
  });
}

export function setAgentRunner(runner: AgentRunner): void {
  agentRunner = runner;
}

export function setAgentStopper(stopper: AgentStopper): void {
  agentStopper = stopper;
}

export function setAppShutdown(shutdown: AppShutdown): void {
  appShutdown = shutdown;
}

export function setAppRestart(restart: AppRestart): void {
  appRestart = restart;
}

export function setMemorySummarizer(summarizer: MemorySummarizer): void {
  memorySummarizer = summarizer;
}

// ---------------------------------------------------------------------------
// Memory summarisation: triggered asynchronously after agent response
// ---------------------------------------------------------------------------

/** Set of experiment IDs currently being summarised (prevent concurrent runs). */
const summarizingExperiments = new Set<string>();

function maybeTriggerSummarization(experimentId: string): void {
  if (summarizingExperiments.has(experimentId)) return;
  if (!memorySummarizer) return;

  const total = getMessageCount(experimentId);
  if (!needsSummarization(experimentId, total)) return;

  const memory = getMemory(experimentId);
  const alreadySummarized = memory?.summarized_count ?? 0;
  // Leave the most recent MEMORY_RECENT_PAIRS*2 messages unsummarised
  const keepTail = MEMORY_RECENT_PAIRS * 2;
  const summarizeUpTo = total - keepTail;
  if (summarizeUpTo <= alreadySummarized) return;

  const toSummarize = getMessagesFromOffset(experimentId, alreadySummarized, summarizeUpTo - alreadySummarized);
  if (toSummarize.length === 0) return;

  const prompt = buildSummarizationPrompt(toSummarize, memory?.summary ?? '');
  summarizingExperiments.add(experimentId);
  logger.info({ experimentId, messageCount: toSummarize.length }, 'Starting memory summarisation');

  memorySummarizer(
    experimentId,
    prompt,
    (summary) => {
      setMemorySummary(experimentId, summary, summarizeUpTo);
      summarizingExperiments.delete(experimentId);
      logger.info({ experimentId, summarizeUpTo }, 'Memory summarisation complete');
    },
    (err) => {
      summarizingExperiments.delete(experimentId);
      logger.warn({ experimentId, err }, 'Memory summarisation failed');
    },
  );
}

// ---------------------------------------------------------------------------
// Active tasks tracking (parallel execution + cancellation)
// ---------------------------------------------------------------------------

interface ActiveTask {
  id: string;
  experimentId: string;
  sourcePrompt: string;
  prompt: string;
  status: 'running' | 'done' | 'error' | 'cancelled';
  startedAt: string;
  finishedAt?: string;
  streamingMsgId?: string;  // DB message ID for in-progress response
  streamingText: string;    // accumulated chunk text
  finalMessage?: { id: string; experiment_id: string; role: string; content: string; timestamp: string };  // saved when done, for replay on reconnect
  _heartbeat?: ReturnType<typeof setInterval>;  // periodic heartbeat timer
  _lastStatus?: string;  // last status line sent
  _statusHistory?: { message: string; timestamp: string }[];
  _lastStatusAt?: number;  // timestamp of the last non-heartbeat status line
  _heartbeatSent?: boolean;
  benchmarkRunId?: string;
  benchmarkMode?: 'canonical' | 'prompt-run' | 'skill-improvement';
  benchmarkDefinitionId?: string;
  benchmarkDefinitionTitle?: string;
  benchmarkLabel?: string;
  benchmarkPromptSource?: string;
  benchmarkRequiredArtifacts?: string[];
  skillImprovementNote?: string;
  skillSnapshot?: BenchmarkSkillSnapshot | null;
}

const activeTasks = new Map<string, ActiveTask>();

function syncProcessHistory(task: ActiveTask): void {
  if (task.status !== 'running') {
    deleteProcessHistory(task.id);
    return;
  }

  upsertProcessHistory({
    id: task.id,
    experimentId: task.experimentId,
    prompt: task.prompt || 'Running task',
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    _lastStatus: task._lastStatus || '',
    _statusHistory: task._statusHistory ?? [],
  });
}

function serializeTask(task: ActiveTask): Record<string, unknown> {
  return {
    id: task.id,
    experimentId: task.experimentId,
    prompt: task.prompt,
    status: task.status,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    streamingMsgId: task.streamingMsgId,
    streamingText: task.streamingText,
    finalMessage: task.finalMessage,
    _lastStatus: task._lastStatus,
    _statusHistory: task._statusHistory,
  };
}

function generateTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function generateBenchmarkRunId(): string {
  return `bench-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSkillSnapshot(skillName: string): BenchmarkSkillSnapshot | null {
  const normalizedName = String(skillName || '').trim();
  if (!normalizedName) return null;

  const skillDir = path.resolve(process.cwd(), 'skills', normalizedName);
  if (!fs.existsSync(skillDir) || !fs.statSync(skillDir).isDirectory()) return null;

  const files: BenchmarkSkillSnapshot['files'] = [];
  const walk = (dir: string, prefix: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.coreclaw-marketplace.json') continue;
      const entryPath = path.join(dir, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(entryPath, relPath);
        continue;
      }
      const content = fs.readFileSync(entryPath, 'utf-8');
      files.push({
        path: relPath,
        sizeBytes: Buffer.byteLength(content, 'utf-8'),
        sha256: createHash('sha256').update(content).digest('hex'),
        content,
      });
    }
  };
  walk(skillDir, '');

  const aggregate = createHash('sha256');
  for (const file of files.sort((left, right) => left.path.localeCompare(right.path))) {
    aggregate.update(file.path);
    aggregate.update('\0');
    aggregate.update(file.sha256);
    aggregate.update('\0');
  }

  return {
    runId: '',
    skillName: normalizedName,
    capturedAt: new Date().toISOString(),
    sha256: aggregate.digest('hex'),
    fileCount: files.length,
    files,
  };
}

function createBenchmarkRunContext(
  experimentId: string,
  taskId: string,
  promptText: string,
  startedAt: string,
  benchmark: { id: string; title: string; label: string; promptSource: string; requiredArtifacts: string[] },
  options?: { mode?: 'canonical' | 'prompt-run' | 'skill-improvement'; skillImprovementNote?: string },
): { manifest: BenchmarkRunManifest; requiredArtifacts: string[]; skillSnapshot: BenchmarkSkillSnapshot | null } {
  const experiment = getExperiment(experimentId);
  const settings = loadSettings();
  const { source } = resolveGitHubToken();
  const skillSnapshot = buildSkillSnapshot(experiment?.skill || '');
  const runId = generateBenchmarkRunId();
  if (skillSnapshot) {
    skillSnapshot.runId = runId;
  }

  return {
    manifest: {
      runId,
      experimentId,
      taskId,
      mode: options?.mode || 'canonical',
      benchmarkDefinitionId: benchmark.id,
      benchmarkDefinitionTitle: benchmark.title,
      promptSource: benchmark.promptSource,
      promptLabel: benchmark.label,
      promptText,
      startedAt,
      status: 'running',
      model: settings.copilot_model || '',
      skill: experiment?.skill || '',
      enabledMcpServers: parseEnabledMcpServers(experiment?.mcp_servers || ''),
      githubMcpTools: settings.github_mcp_tools || '',
      containerImage: CONTAINER_IMAGE,
      copilotAuthSource: source,
      skillImprovementNote: options?.skillImprovementNote || '',
      skillSnapshotHash: skillSnapshot?.sha256 || '',
      skillSnapshotFileCount: skillSnapshot?.fileCount || 0,
      skillSnapshotCapturedAt: skillSnapshot?.capturedAt || '',
    },
    requiredArtifacts: benchmark.requiredArtifacts,
    skillSnapshot,
  };
}

function parseEnabledMcpServers(rawValue: string): string[] {
  try {
    if (!rawValue) return [];
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed)
      ? parsed.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function createBenchmarkRunManifest(
  experimentId: string,
  taskId: string,
  promptText: string,
  startedAt: string,
): BenchmarkRunManifest | null {
  const benchmark = matchBenchmarkDefinition(promptText);
  if (!benchmark) return null;

  return createBenchmarkRunContext(experimentId, taskId, promptText, startedAt, benchmark).manifest;
}

function finalizeBenchmarkRun(task: ActiveTask, finalResponse: string): void {
  if (!task.benchmarkRunId || !task.benchmarkLabel || !task.benchmarkRequiredArtifacts) return;
  const finalStatus = task.status === 'running' ? 'error' : task.status;

  const settings = loadSettings();
  const experiment = getExperiment(task.experimentId);
  const { source } = resolveGitHubToken();
  const manifest: BenchmarkRunManifest = {
    runId: task.benchmarkRunId,
    experimentId: task.experimentId,
    taskId: task.id,
    mode: task.benchmarkMode || 'canonical',
    benchmarkDefinitionId: task.benchmarkDefinitionId || '',
    benchmarkDefinitionTitle: task.benchmarkDefinitionTitle || '',
    promptSource: task.benchmarkPromptSource || 'tests/benchmark-prompts.json',
    promptLabel: task.benchmarkLabel,
    promptText: task.sourcePrompt,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    status: finalStatus,
    model: settings.copilot_model || '',
    skill: experiment?.skill || '',
    enabledMcpServers: parseEnabledMcpServers(experiment?.mcp_servers || ''),
    githubMcpTools: settings.github_mcp_tools || '',
    containerImage: CONTAINER_IMAGE,
    copilotAuthSource: source,
    skillImprovementNote: task.skillImprovementNote || '',
    skillSnapshotHash: task.skillSnapshot?.sha256 || '',
    skillSnapshotFileCount: task.skillSnapshot?.fileCount || 0,
    skillSnapshotCapturedAt: task.skillSnapshot?.capturedAt || '',
  };
  writeBenchmarkRunManifest(task.experimentId, task.benchmarkRunId, manifest);
  if (task.skillSnapshot) {
    writeBenchmarkSkillSnapshot(task.experimentId, task.benchmarkRunId, task.skillSnapshot);
  }

  const artifactCheck = buildBenchmarkArtifactCheck(
    task.benchmarkRunId,
    task.benchmarkRequiredArtifacts,
    listArtifacts(task.experimentId),
    (relativePath) => getArtifactSizeBytes(task.experimentId, relativePath),
  );
  writeBenchmarkArtifactCheck(task.experimentId, task.benchmarkRunId, artifactCheck);

  const evaluation = buildBenchmarkEvaluationResult(
    task.benchmarkRunId,
    finalStatus,
    artifactCheck,
    finalResponse,
  );
  writeBenchmarkEvaluationResult(task.experimentId, task.benchmarkRunId, evaluation);
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function cors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  cors(res);
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // ---- Static files ----
  if (method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      });
      fs.createReadStream(htmlPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Frontend not found');
    }
    return;
  }

  // Viewer page for markdown/mermaid files
  if (method === 'GET' && pathname === '/viewer') {
    const htmlPath = path.join(__dirname, '..', 'public', 'viewer.html');
    if (fs.existsSync(htmlPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(htmlPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Viewer not found');
    }
    return;
  }

  // Serve static assets from public/
  if (method === 'GET' && pathname.startsWith('/public/')) {
    const filePath = path.join(__dirname, '..', pathname);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      const mimeTypes: Record<string, string> = {
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
    return;
  }

  // ---- API: Experiments ----

  // GET /api/experiments
  if (method === 'GET' && pathname === '/api/experiments') {
    const status = url.searchParams.get('status') || undefined;
    const experiments = listExperiments(status);
    sendJson(res, 200, experiments);
    return;
  }

  // POST /api/experiments
  if (method === 'POST' && pathname === '/api/experiments') {
    const body = JSON.parse(await readBody(req));
    const settings = loadSettings();
    const exp = createExperiment(body.name || 'Untitled Experiment', body.description, settings.github_username || '', body.sync_repo || '', body.skill || '', body.mcp_servers || '');
    sendJson(res, 201, exp);
    return;
  }

  // GET /api/experiments/:id
  const expMatch = pathname.match(/^\/api\/experiments\/([^/]+)$/);
  if (method === 'GET' && expMatch) {
    const exp = getExperiment(expMatch[1]);
    if (!exp) { sendJson(res, 404, { error: 'Not found' }); return; }
    sendJson(res, 200, exp);
    return;
  }

  // PATCH /api/experiments/:id
  if (method === 'PATCH' && expMatch) {
    const body = JSON.parse(await readBody(req));
    const exp = updateExperiment(expMatch[1], body);
    if (!exp) { sendJson(res, 404, { error: 'Not found' }); return; }
    sendJson(res, 200, exp);
    return;
  }

  // DELETE /api/experiments/:id
  if (method === 'DELETE' && expMatch) {
    const ok = deleteExperiment(expMatch[1]);
    sendJson(res, ok ? 200 : 404, { ok });
    return;
  }

  // ---- API: Messages ----

  // GET /api/experiments/:id/messages
  const msgMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/messages$/);
  if (method === 'GET' && msgMatch) {
    const limit = parseInt(url.searchParams.get('limit') || '200', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const messages = getMessages(msgMatch[1], limit, offset);
    const total = getMessageCount(msgMatch[1]);
    sendJson(res, 200, { messages, total });
    return;
  }

  // GET /api/experiments/:id/process-history
  const processHistoryMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/process-history$/);
  if (method === 'GET' && processHistoryMatch) {
    const expId = processHistoryMatch[1];
    if (!getExperiment(expId)) { sendJson(res, 404, { error: 'Not found' }); return; }
    const tasks = listProcessHistory(expId);
    sendJson(res, 200, { tasks });
    return;
  }

  // GET /api/experiments/:id/activity
  const activityMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/activity$/);
  if (method === 'GET' && activityMatch) {
    const expId = activityMatch[1];
    if (!getExperiment(expId)) { sendJson(res, 404, { error: 'Not found' }); return; }
    const limit = parseInt(url.searchParams.get('limit') || '500', 10);
    const events = listActivityEvents(expId, limit);
    sendJson(res, 200, { events });
    return;
  }

  // GET /api/experiments/:id/benchmark-runs
  const benchmarkRunsMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/benchmark-runs$/);
  if (method === 'GET' && benchmarkRunsMatch) {
    const expId = benchmarkRunsMatch[1];
    if (!getExperiment(expId)) { sendJson(res, 404, { error: 'Not found' }); return; }
    const runs = listBenchmarkRuns(expId);
    sendJson(res, 200, { runs });
    return;
  }

  // GET /api/benchmarks
  if (method === 'GET' && pathname === '/api/benchmarks') {
    const benchmarks = loadBenchmarkDefinitions().map((definition) => ({
      id: definition.id,
      label: definition.label,
      title: definition.title,
      promptSource: definition.promptSource,
      requiredArtifacts: definition.requiredArtifacts,
      promptText: definition.promptText,
    }));
    sendJson(res, 200, { benchmarks });
    return;
  }

  // GET /api/experiments/:id/messages/search?q=...
  const msgSearchMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/messages\/search$/);
  if (method === 'GET' && msgSearchMatch) {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) { sendJson(res, 200, { messages: [] }); return; }
    const messages = searchMessages(msgSearchMatch[1], q, 200);
    sendJson(res, 200, { messages });
    return;
  }

  // POST /api/experiments/:id/messages — send user message and run agent
  if (method === 'POST' && msgMatch) {
    const expId = msgMatch[1];
    const exp = getExperiment(expId);
    if (!exp) { sendJson(res, 404, { error: 'Experiment not found' }); return; }

    const body = JSON.parse(await readBody(req));
    const userMsg = addMessage(expId, 'user', body.content);
    sendJson(res, 201, userMsg);
    return;
  }

  // ---- API: File Upload ----

  // POST /api/experiments/:id/upload — upload file to experiment workspace
  const uploadMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/upload$/);
  if (method === 'POST' && uploadMatch) {
    const expId = uploadMatch[1];
    const exp = getExperiment(expId);
    if (!exp) { sendJson(res, 404, { error: 'Experiment not found' }); return; }

    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart/form-data')) {
      // Parse multipart boundary
      const boundaryMatch = contentType.match(/boundary=(.+)/);
      if (!boundaryMatch) { sendJson(res, 400, { error: 'No boundary' }); return; }
      const boundary = boundaryMatch[1];

      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        const files = parseMultipart(body, boundary);

        const uploaded: string[] = [];
        const uploadDir = getUploadDir(expId);

        for (const file of files) {
          // Sanitize: keep Unicode letters/digits, strip path separators and control chars
          const baseName = path.basename(file.filename);
          const safeName = baseName
            .replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_')  // strip dangerous chars
            .replace(/^\.+/, '_')                        // prevent hidden files
            || 'upload';
          const filePath = path.join(uploadDir, safeName);
          fs.writeFileSync(filePath, file.data);
          uploaded.push(safeName);
          logger.info({ expId, filename: safeName }, 'File uploaded');
        }

        sendJson(res, 200, { uploaded });
      });
    } else {
      sendJson(res, 400, { error: 'Expected multipart/form-data' });
    }
    return;
  }

  // GET /api/experiments/:id/uploads — list uploaded files
  const uploadsMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/uploads$/);
  if (method === 'GET' && uploadsMatch) {
    const dir = getUploadDir(uploadsMatch[1]);
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(f => !f.startsWith('.'))
      : [];
    sendJson(res, 200, files);
    return;
  }

  // ---- API: Artifacts ----

  // ---- API: Memory ----

  // GET /api/experiments/:id/memory — get current memory state
  const memoryMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/memory$/);
  if (method === 'GET' && memoryMatch) {
    const expId = memoryMatch[1];
    if (!getExperiment(expId)) { sendJson(res, 404, { error: 'Not found' }); return; }
    const memory = getMemory(expId);
    const total = getMessageCount(expId);
    sendJson(res, 200, {
      memory: memory ?? { experiment_id: expId, summary: '', summarized_count: 0 },
      total_messages: total,
      is_summarizing: summarizingExperiments.has(expId),
    });
    return;
  }

  // DELETE /api/experiments/:id/memory — clear memory summary
  if (method === 'DELETE' && memoryMatch) {
    const expId = memoryMatch[1];
    if (!getExperiment(expId)) { sendJson(res, 404, { error: 'Not found' }); return; }
    clearMemory(expId);
    sendJson(res, 200, { ok: true });
    return;
  }

  // POST /api/experiments/:id/memory/summarize — manually trigger summarisation
  const memSumMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/memory\/summarize$/);
  if (method === 'POST' && memSumMatch) {
    const expId = memSumMatch[1];
    if (!getExperiment(expId)) { sendJson(res, 404, { error: 'Not found' }); return; }
    if (summarizingExperiments.has(expId)) {
      sendJson(res, 409, { error: 'Summarisation already in progress' });
      return;
    }
    if (!memorySummarizer) {
      sendJson(res, 503, { error: 'Summariser not configured' });
      return;
    }
    const total = getMessageCount(expId);
    const memory = getMemory(expId);
    const alreadySummarized = memory?.summarized_count ?? 0;
    const toSummarize = getMessagesFromOffset(expId, alreadySummarized, total - alreadySummarized);
    if (toSummarize.length === 0) {
      sendJson(res, 200, { ok: true, message: 'Nothing to summarise' });
      return;
    }
    const prompt = buildSummarizationPrompt(toSummarize, memory?.summary ?? '');
    summarizingExperiments.add(expId);
    memorySummarizer(
      expId,
      prompt,
      (summary) => {
        setMemorySummary(expId, summary, total);
        summarizingExperiments.delete(expId);
        broadcastToExperiment(expId, {
          type: 'memory_update',
          memory: getMemory(expId),
        });
      },
      (err) => {
        summarizingExperiments.delete(expId);
        logger.warn({ expId, err }, 'Manual summarisation failed');
      },
    );
    sendJson(res, 202, { ok: true, message: 'Summarisation started' });
    return;
  }

  // GET /api/experiments/:id/artifacts
  const artMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/artifacts$/);
  if (method === 'GET' && artMatch) {
    const artifacts = listArtifacts(artMatch[1]);
    sendJson(res, 200, artifacts);
    return;
  }

  // POST /api/experiments/:id/import-zip — import a ZIP file into experiment
  const importMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/import-zip$/);
  if (method === 'POST' && importMatch) {
    const expId = importMatch[1];
    const exp = getExperiment(expId);
    if (!exp) { sendJson(res, 404, { error: 'Experiment not found' }); return; }

    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);

      // Extract ZIP content type boundary or raw ZIP
      let zipData: Buffer;
      const ct = req.headers['content-type'] || '';
      if (ct.includes('multipart/form-data')) {
        const boundaryMatch = ct.match(/boundary=(.+)/);
        if (!boundaryMatch) { sendJson(res, 400, { error: 'No boundary' }); return; }
        const files = parseMultipart(body, boundaryMatch[1]);
        if (files.length === 0) { sendJson(res, 400, { error: 'No file in upload' }); return; }
        zipData = files[0].data;
      } else {
        zipData = body;
      }

      try {
        const extracted = extractZip(zipData);
        const wsDir = path.join(GROUPS_DIR, `experiment-${expId}`);
        let count = 0;

        for (const file of extracted) {
          // Skip conversation.md (don't overwrite live log)
          if (file.name === 'conversation.md') continue;
          const destPath = path.join(wsDir, file.name);
          fs.mkdirSync(path.dirname(destPath), { recursive: true });
          fs.writeFileSync(destPath, file.data);
          count++;
        }

        logger.info({ expId, fileCount: count }, 'ZIP imported');
        sendJson(res, 200, { ok: true, imported: count });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sendJson(res, 400, { error: `ZIP extraction failed: ${msg}` });
      }
    });
    return;
  }

  // GET /api/experiments/:id/download — download all artifacts as ZIP
  const downloadAllMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/download$/);
  if (method === 'GET' && downloadAllMatch) {
    const expId = downloadAllMatch[1];
    const exp = getExperiment(expId);
    if (!exp) { sendJson(res, 404, { error: 'Experiment not found' }); return; }

    const artifacts = listArtifacts(expId);
    if (artifacts.length === 0) { sendJson(res, 404, { error: 'No artifacts' }); return; }

    const safeName = exp.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const encodedName = encodeURIComponent(exp.name) + '.zip';

    // Build ZIP using Node.js (no dependencies)
    const files: { name: string; data: Buffer }[] = [];

    for (const artifact of artifacts) {
      const filePath = resolveArtifactPath(expId, artifact);
      if (filePath) {
        files.push({ name: artifact, data: fs.readFileSync(filePath) });
      }
    }

    // Also include conversation log
    const messagesData = getMessages(expId, 10000);
    if (messagesData.length > 0) {
      const logLines = [`# ${exp.name}\n`, `> ${exp.description || ''}\n`];
      for (const m of messagesData) {
        const ts = new Date(m.timestamp).toLocaleString('ja-JP');
        const role = m.role === 'user' ? '👤 User' : m.role === 'assistant' ? '🤖 CoreClaw' : '⚙️ System';
        logLines.push(`## ${role} (${ts})\n\n${m.content}\n\n---\n`);
      }
      files.push({ name: 'conversation.md', data: Buffer.from(logLines.join('\n'), 'utf-8') });
    }

    const zipBuffer = buildZip(files);

    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}.zip"; filename*=UTF-8''${encodedName}`,
      'Content-Length': zipBuffer.length,
      'Access-Control-Allow-Origin': '*',
    });
    res.end(zipBuffer);
    return;
  }

  // GET /api/experiments/:id/artifacts/:path — download artifact
  const artFileMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/artifacts\/(.+)$/);
  if (method === 'GET' && artFileMatch) {
    const filePath = resolveArtifactPath(artFileMatch[1], decodeURIComponent(artFileMatch[2]));
    if (filePath) {
      const ext = path.extname(filePath);
      const mimeTypes: Record<string, string> = {
        '.csv': 'text/csv',
        '.tsv': 'text/tab-separated-values',
        '.json': 'application/json',
        '.txt': 'text/plain',
        '.md': 'text/markdown; charset=utf-8',
        '.py': 'text/plain; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.ts': 'text/plain; charset=utf-8',
        '.r': 'text/plain; charset=utf-8',
        '.sh': 'text/plain; charset=utf-8',
        '.yaml': 'text/yaml; charset=utf-8',
        '.yml': 'text/yaml; charset=utf-8',
        '.xml': 'application/xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.html': 'text/html; charset=utf-8',
        '.mmd': 'text/plain; charset=utf-8',
      };
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${path.basename(filePath)}"`,
        'Access-Control-Allow-Origin': '*',
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      sendJson(res, 404, { error: 'Artifact not found' });
    }
    return;
  }

  // ---- API: GitHub Sync ----

  // POST /api/experiments/:id/sync — push experiment to GitHub
  const syncMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/sync$/);
  if (method === 'POST' && syncMatch) {
    const result = await syncExperiment(syncMatch[1]);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  // POST /api/experiments/:id/pull — pull experiment from GitHub
  const pullMatch = pathname.match(/^\/api\/experiments\/([^/]+)\/pull$/);
  if (method === 'POST' && pullMatch) {
    const result = await pullExperiment(pullMatch[1]);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  // ---- API: Component Updates ----

  // GET /api/versions — get current versions of components
  if (method === 'GET' && pathname === '/api/versions') {
    try {
      const versions = getComponentVersions();
      sendJson(res, 200, versions);
    } catch (err) {
      logger.error({ err }, 'Failed to get component versions');
      sendJson(res, 500, { error: 'Failed to load versions' });
    }
    return;
  }

  // GET /api/auth/copilot-status — get cached or refreshed Copilot auth status
  if (method === 'GET' && pathname === '/api/auth/copilot-status') {
    const refresh = url.searchParams.get('refresh') === '1';
    const status = await getCachedCopilotAuthStatus(refresh);
    sendJson(res, 200, status);
    return;
  }

  // POST /api/check/:component — check if update is available
  const checkMatch = pathname.match(/^\/api\/check\/(.+)$/);
  if (method === 'POST' && checkMatch) {
    const component = checkMatch[1];
    const result = await checkComponentUpdate(component);
    sendJson(res, 200, result);
    return;
  }

  // POST /api/update/:component — update a component
  const updateMatch = pathname.match(/^\/api\/update\/(.+)$/);
  if (method === 'POST' && updateMatch) {
    const component = updateMatch[1];
    const result = await updateComponent(component);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  // POST /api/shutdown — stop the current CoreClaw process
  if (method === 'POST' && pathname === '/api/shutdown') {
    if (!appShutdown) {
      sendJson(res, 503, { ok: false, message: 'Shutdown is not available' });
      return;
    }

    const shutdown = appShutdown;

    res.once('finish', () => {
      setTimeout(() => {
        void shutdown('api-shutdown').catch((err) => {
          logger.error({ err }, 'App shutdown callback failed');
        });
      }, 50);
    });

    sendJson(res, 200, { ok: true, message: 'Shutting down CoreClaw' });
    return;
  }

  // ---- API: Skills ----

  // GET /api/skills
  if (method === 'GET' && pathname === '/api/skills') {
    let marketplaceGroups: Awaited<ReturnType<typeof listMarketplaceSkillGroups>> = [];
    try {
      marketplaceGroups = await listMarketplaceSkillGroups();
    } catch (err) {
      logger.warn({ err }, 'Failed to preload marketplace groups for local skills');
    }

    const skills = await Promise.all(listAvailableSkills().map(async (name) => {
      const meta = getSkillMetadata(name);
      const marketplaceStatus = await getMarketplaceSkillStatus(name, marketplaceGroups);
      // Count files in the skill directory
      const skillDir = path.resolve(process.cwd(), 'skills', name);
      let fileCount = 0;
      if (fs.existsSync(skillDir)) {
        const countFiles = (dir: string): number => {
          let n = 0;
          for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === MARKETPLACE_IMPORT_METADATA_FILE) continue;
            n += e.isDirectory() ? countFiles(path.join(dir, e.name)) : 1;
          }
          return n;
        };
        fileCount = countFiles(skillDir);
      }
      return {
        name,
        description: meta?.description || '',
        version: marketplaceStatus.marketplaceImported
          ? (marketplaceStatus.currentVersion || meta?.version || '')
          : (meta?.version || marketplaceStatus.currentVersion || ''),
        fileCount,
        marketplaceImported: marketplaceStatus.marketplaceImported,
        marketplaceSlug: marketplaceStatus.marketplaceSlug,
        latestVersion: marketplaceStatus.latestVersion,
        updateAvailable: marketplaceStatus.updateAvailable,
      };
    }));
    sendJson(res, 200, skills);
    return;
  }

  // GET /api/skills/:name/marketplace-status
  if (method === 'GET' && pathname.match(/^\/api\/skills\/[^/]+\/marketplace-status$/)) {
    const name = pathname.split('/')[3].replace(/[^a-zA-Z0-9_-]/g, '');
    const skillDir = path.resolve(process.cwd(), 'skills', name);
    if (!fs.existsSync(skillDir)) {
      sendJson(res, 404, { error: 'Skill not found' });
      return;
    }

    const status = await getMarketplaceSkillStatus(name);
    if (!status.marketplaceImported) {
      sendJson(res, 404, { error: 'Marketplace metadata is not available for this skill' });
      return;
    }

    sendJson(res, 200, {
      name,
      ...status,
    });
    return;
  }

  // GET /api/skills/marketplace
  if (method === 'GET' && pathname === '/api/skills/marketplace') {
    try {
      const groups = await listMarketplaceSkillGroups();
      const groupsWithStatus = groups.map((group) => {
        const importMeta = getMarketplaceImportMetadata(group.slug);
        const currentVersion = importMeta?.version || '';
        return {
          ...group,
          updateAvailable: Boolean(
            group.installed
            && currentVersion
            && group.version
            && isVersionNewer(group.version, currentVersion),
          ),
        };
      });
      sendJson(res, 200, groupsWithStatus);
    } catch (err) {
      logger.error({ err }, 'Failed to list marketplace skills');
      sendJson(res, 502, { error: 'Failed to load marketplace skills' });
    }
    return;
  }

  // POST /api/skills/marketplace/import
  if (method === 'POST' && pathname === '/api/skills/marketplace/import') {
    try {
      const body = JSON.parse(await readBody(req));
      const group = String(body.group || '').trim();
      if (!group) {
        sendJson(res, 400, { error: 'Marketplace group is required' });
        return;
      }
      const result = importMarketplaceSkillGroup(group);
      sendJson(res, 200, { ...result, imported: true });
    } catch (err) {
      logger.error({ err }, 'Failed to import marketplace skill');
      sendJson(res, 500, { error: err instanceof Error ? err.message : 'Failed to import marketplace skill' });
    }
    return;
  }

  // GET /api/skills/:name/files — list files in a skill
  if (method === 'GET' && pathname.match(/^\/api\/skills\/[^/]+\/files$/)) {
    const name = pathname.split('/')[3].replace(/[^a-zA-Z0-9_-]/g, '');
    const skillDir = path.resolve(process.cwd(), 'skills', name);
    if (!fs.existsSync(skillDir)) { sendJson(res, 404, { error: 'Skill not found' }); return; }
    const files: string[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) walk(path.join(dir, e.name), rel);
        else files.push(rel);
      }
    };
    walk(skillDir, '');
    sendJson(res, 200, { name, files });
    return;
  }

  // POST /api/skills — create a new skill
  if (method === 'POST' && pathname === '/api/skills') {
    const body = JSON.parse(await readBody(req));
    const name = (body.name || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
    const description = (body.description || '').trim();
    const content = (body.content || '').trim();
    if (!name) { sendJson(res, 400, { error: 'Invalid skill name' }); return; }
    const skillsDir = path.resolve(process.cwd(), 'skills', name);
    if (fs.existsSync(skillsDir)) { sendJson(res, 409, { error: 'Skill already exists' }); return; }
    fs.mkdirSync(skillsDir, { recursive: true });
    const md = `---\nname: ${name}\ndescription: |\n  ${description || 'No description'}\n---\n\n${content || 'You are a helpful AI assistant.'}\n`;
    fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), md, 'utf-8');
    sendJson(res, 201, { name, description });
    return;
  }

  // PUT /api/skills/:name/scan/whitelist — update whitelist for a skill
  const wlMatch = pathname.match(/^\/api\/skills\/([^/]+)\/scan\/whitelist$/);
  if (method === 'PUT' && wlMatch) {
    const name = wlMatch[1].replace(/[^a-zA-Z0-9_-]/g, '');
    if (!name) { sendJson(res, 400, { error: 'Invalid skill name' }); return; }
    const body = JSON.parse(await readBody(req));
    if (!Array.isArray(body.keys)) { sendJson(res, 400, { error: 'Expected { keys: string[] }' }); return; }
    const wl = loadScanWhitelist();
    wl[name] = body.keys.map((k: unknown) => String(k));
    saveScanWhitelist(wl);
    sendJson(res, 200, { name, whitelistedCount: wl[name].length });
    return;
  }

  // PUT /api/skills/:name — upload a ZIP file containing skill files
  if (method === 'PUT' && pathname.startsWith('/api/skills/')) {
    const name = pathname.slice('/api/skills/'.length).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!name) { sendJson(res, 400, { error: 'Invalid skill name' }); return; }
    // Read raw body as Buffer
    const chunks: Buffer[] = [];
    for await (const chunk of req) { chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk); }
    const bodyBuf = Buffer.concat(chunks);
    const skillsDir = path.resolve(process.cwd(), 'skills', name);
    // Check if it's a ZIP file (magic bytes PK\x03\x04)
    if (bodyBuf.length >= 4 && bodyBuf[0] === 0x50 && bodyBuf[1] === 0x4B && bodyBuf[2] === 0x03 && bodyBuf[3] === 0x04) {
      // Extract ZIP to temp, then move to skills dir
      const tmpDir = path.resolve(process.cwd(), '.tmp-skill-' + Date.now());
      fs.mkdirSync(tmpDir, { recursive: true });
      const zipPath = path.join(tmpDir, 'skill.zip');
      fs.writeFileSync(zipPath, bodyBuf);
      try {
        execSync(`unzip -o -q "${zipPath}" -d "${tmpDir}/extracted"`, { timeout: 30000 });
        // Find the root: if ZIP contains a single top-level folder, use its contents
        const extracted = path.join(tmpDir, 'extracted');
        const entries = fs.readdirSync(extracted).filter(e => !e.startsWith('.'));
        let srcDir = extracted;
        if (entries.length === 1 && fs.statSync(path.join(extracted, entries[0])).isDirectory()) {
          srcDir = path.join(extracted, entries[0]);
        }
        // Verify SKILL.md exists
        if (!fs.existsSync(path.join(srcDir, 'SKILL.md'))) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          sendJson(res, 400, { error: 'ZIP must contain a SKILL.md file' });
          return;
        }
        // Replace skill directory
        if (fs.existsSync(skillsDir)) fs.rmSync(skillsDir, { recursive: true, force: true });
        fs.mkdirSync(skillsDir, { recursive: true });
        // Copy extracted files
        const copyDir = (src: string, dst: string) => {
          fs.mkdirSync(dst, { recursive: true });
          for (const e of fs.readdirSync(src, { withFileTypes: true })) {
            if (e.name.startsWith('.')) continue;
            const s = path.join(src, e.name);
            const d = path.join(dst, e.name);
            if (e.isDirectory()) copyDir(s, d);
            else fs.copyFileSync(s, d);
          }
        };
        copyDir(srcDir, skillsDir);
        fs.rmSync(tmpDir, { recursive: true, force: true });
        sendJson(res, 200, { name, updated: true });
      } catch (err) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        sendJson(res, 500, { error: 'Failed to extract ZIP' });
      }
    } else {
      // Treat as plain text SKILL.md content (backward compat)
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(path.join(skillsDir, 'SKILL.md'), bodyBuf.toString('utf-8'), 'utf-8');
      sendJson(res, 200, { name, updated: true });
    }
    return;
  }

  // DELETE /api/skills/:name — delete a skill
  if (method === 'DELETE' && pathname.startsWith('/api/skills/')) {
    const name = pathname.slice('/api/skills/'.length).replace(/[^a-zA-Z0-9_-]/g, '');
    if (!name) { sendJson(res, 400, { error: 'Invalid skill name' }); return; }
    const skillsDir = path.resolve(process.cwd(), 'skills', name);
    if (!fs.existsSync(skillsDir)) { sendJson(res, 404, { error: 'Skill not found' }); return; }
    fs.rmSync(skillsDir, { recursive: true, force: true });
    sendJson(res, 200, { name, deleted: true });
    return;
  }

  // POST /api/skills/:name/scan — scan a skill for security risks
  const scanMatch = pathname.match(/^\/api\/skills\/([^/]+)\/scan$/);
  if (method === 'POST' && scanMatch) {
    const name = scanMatch[1].replace(/[^a-zA-Z0-9_-]/g, '');
    if (!name) { sendJson(res, 400, { error: 'Invalid skill name' }); return; }
    const skillDir = path.resolve(process.cwd(), 'skills', name);
    if (!fs.existsSync(skillDir)) { sendJson(res, 404, { error: 'Skill not found' }); return; }

    // Collect all text files in the skill
    const allFiles: { rel: string; content: string }[] = [];
    const walkScan = (dir: string, prefix: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) { walkScan(path.join(dir, e.name), rel); continue; }
        // Only scan text files (md, txt, yaml, yml, json, js, ts, py, sh, etc.)
        const ext = path.extname(e.name).toLowerCase();
        const textExts = ['.md', '.txt', '.yaml', '.yml', '.json', '.js', '.ts', '.py', '.sh', '.bash', '.zsh', '.r', '.toml', '.cfg', '.ini', '.xml', '.html', '.css'];
        if (textExts.includes(ext) || !ext) {
          try {
            const content = fs.readFileSync(path.join(dir, e.name), 'utf-8');
            allFiles.push({ rel, content });
          } catch { /* skip unreadable */ }
        }
      }
    };
    walkScan(skillDir, '');

    // Define risk patterns
    const highRiskPatterns = [
      { pattern: /\b(rm\s+-rf|rmdir\s+\/|del\s+\/[sqf])/gi, label: 'Destructive file deletion command' },
      { pattern: /\b(curl|wget|fetch)\b.*\|\s*(bash|sh|zsh)/gi, label: 'Remote code execution (pipe to shell)' },
      { pattern: /\beval\s*\(/gi, label: 'Dynamic code execution (eval)' },
      { pattern: /\bnew\s+Function\s*\(/gi, label: 'Dynamic function construction' },
      { pattern: /\b(os\.system|subprocess\.(call|run|Popen)|exec(sync|File)?)\s*\(/gi, label: 'Shell command execution' },
      { pattern: /\b(child_process|spawn|execSync)\b/gi, label: 'Child process execution' },
      { pattern: /\bsudo\b/gi, label: 'Privilege escalation (sudo)' },
      { pattern: /\b(chmod\s+[0-7]{3,4}|chown)\b/gi, label: 'File permission modification' },
      { pattern: /\bbase64\s+(--decode|-d)\b/gi, label: 'Base64 decode (obfuscation)' },
      { pattern: /\b(nc|ncat|netcat)\s+-[elp]/gi, label: 'Reverse shell / listener' },
      { pattern: /\bkill\s+-9\b/gi, label: 'Forced process termination' },
      { pattern: /\b(DROP\s+TABLE|DELETE\s+FROM|TRUNCATE)\b/gi, label: 'Destructive SQL command' },
      { pattern: /\b(process\.env|os\.environ)\b.*\b(token|secret|password|key|credential)/gi, label: 'Credential exfiltration from env' },
    ];

    const medRiskPatterns = [
      { pattern: /\b(fetch|axios|http\.get|requests\.get|urllib|httpx)\s*\(/gi, label: 'External HTTP request' },
      { pattern: /https?:\/\/[^\s"'`)\]>]+/gi, label: 'Hardcoded URL' },
      { pattern: /\b(process\.env|os\.environ|getenv)\b/gi, label: 'Environment variable access' },
      { pattern: /\b(\/etc\/|\/root\/|\/var\/|~\/\.ssh|~\/\.aws|~\/\.config)/gi, label: 'Sensitive path reference' },
      { pattern: /\.\.\//g, label: 'Path traversal (../)' },
      { pattern: /\b(api[_-]?key|secret[_-]?key|access[_-]?token)\b/gi, label: 'Credential-related keyword' },
      { pattern: /\bimport\s+(os|sys|subprocess|shutil)\b/gi, label: 'System module import' },
      { pattern: /\brequire\s*\(\s*['"]fs['"]\s*\)/gi, label: 'File system module import' },
      { pattern: /\b(writeFile|appendFile|createWriteStream|fs\.write)\b/gi, label: 'File write operation' },
      { pattern: /\b(unlink|rmSync|rmdirSync)\b/gi, label: 'File removal API' },
    ];

    const findings: { file: string; line: number; level: 'high' | 'medium'; label: string; snippet: string; inCodeBlock?: boolean }[] = [];

    for (const f of allFiles) {
      const lines = f.content.split('\n');
      const isMd = f.rel.endsWith('.md');
      let inCodeBlock = false;
      let inFrontmatter = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Track YAML frontmatter (--- delimited, only at file start)
        if (isMd && i === 0 && line.trim() === '---') { inFrontmatter = true; continue; }
        if (inFrontmatter && line.trim() === '---') { inFrontmatter = false; continue; }
        if (inFrontmatter) continue;
        // Track fenced code blocks in markdown files
        if (isMd && line.trim().startsWith('```')) { inCodeBlock = !inCodeBlock; continue; }
        // Skip markdown headings
        if (line.trim().startsWith('#') && !line.trim().startsWith('#!')) continue;
        for (const rule of highRiskPatterns) {
          rule.pattern.lastIndex = 0;
          if (rule.pattern.test(line)) {
            findings.push({ file: f.rel, line: i + 1, level: 'high', label: rule.label, snippet: line.trim().slice(0, 120), inCodeBlock });
          }
        }
        for (const rule of medRiskPatterns) {
          rule.pattern.lastIndex = 0;
          if (rule.pattern.test(line)) {
            findings.push({ file: f.rel, line: i + 1, level: 'medium', label: rule.label, snippet: line.trim().slice(0, 120), inCodeBlock });
          }
        }
      }
    }

    // Findings inside code blocks are informational only — don't count toward status
    const actionableFindings = findings.filter(f => !f.inCodeBlock);

    // Apply whitelist — whitelisted findings are excluded from status calculation
    const whitelist = loadScanWhitelist();
    const wlKeys = new Set(whitelist[name] || []);
    const nonWhitelisted = actionableFindings.filter(f => !wlKeys.has(`${f.file}:${f.label}`));
    const whitelistedCount = actionableFindings.length - nonWhitelisted.length;
    const highCount = nonWhitelisted.filter(f => f.level === 'high').length;
    const medCount = nonWhitelisted.filter(f => f.level === 'medium').length;
    const status: 'green' | 'yellow' | 'red' = highCount > 0 ? 'red' : medCount > 0 ? 'yellow' : 'green';

    const codeBlockCount = findings.filter(f => f.inCodeBlock).length;

    // Mark whitelisted findings in the response
    const findingsWithWl = actionableFindings.map(f => ({
      ...f,
      whitelisted: wlKeys.has(`${f.file}:${f.label}`),
    }));

    sendJson(res, 200, { name, status, filesScanned: allFiles.length, findings: findingsWithWl, highCount, medCount, codeBlockSkipped: codeBlockCount, whitelistedCount });
    return;
  }

  // ---- API: Settings ----

  // GET /api/settings — return settings (tokens masked)
  if (method === 'GET' && pathname === '/api/settings') {
    const settings = loadSettings();
    // Mask secret values: show only last 4 chars
    const masked = { ...settings };
    for (const key of ['github_token', 'openai_api_key', 'azure_openai_api_key'] as const) {
      const val = masked[key];
      if (val && val.length > 4) {
        masked[key] = '•'.repeat(val.length - 4) + val.slice(-4);
      }
    }
    sendJson(res, 200, masked);
    return;
  }

  // PUT /api/settings — save settings
  if (method === 'PUT' && pathname === '/api/settings') {
    const body = JSON.parse(await readBody(req));
    const current = loadSettings();
    const updated: Record<string, string> = { ...current };

    for (const key of SETTINGS_KEYS) {
      const val = body[key];
      if (val === undefined) continue;
      // If the value is masked (contains •), keep the old value
      if (typeof val === 'string' && val.includes('•')) {
        updated[key] = current[key] || '';
      } else {
        updated[key] = key === 'mcp_servers' ? sanitizeMcpServersValue(val) : val;
      }
    }

    saveSettings(updated);
    void getCachedCopilotAuthStatus(true);
    sendJson(res, 200, { ok: true });
    return;
  }

  // 404
  sendJson(res, 404, { error: 'Not found' });
}

// ---------------------------------------------------------------------------
// WebSocket: streaming agent responses
// ---------------------------------------------------------------------------

// Map from WebSocket client to the experimentId it is currently viewing.
// Only clients subscribed to a given experiment receive its broadcasts.
const clientSubscriptions = new Map<WebSocket, string>();

function broadcastToExperiment(experimentId: string, data: unknown): void {
  const msg = JSON.stringify({ experimentId, ...data as Record<string, unknown> });
  for (const [ws, subId] of clientSubscriptions) {
    if (subId === experimentId && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function broadcastTasks(): void {
  const tasks = Array.from(activeTasks.values(), serializeTask);
  const msg = JSON.stringify({ type: 'tasks', tasks });
  for (const [ws] of clientSubscriptions) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function handleWsMessage(ws: WebSocket, raw: string): void {
  try {
    const data = JSON.parse(raw);

    if (data.type === 'chat' && data.experimentId && data.content) {
      const exp = getExperiment(data.experimentId);
      if (!exp) {
        ws.send(JSON.stringify({ type: 'error', error: 'Experiment not found' }));
        return;
      }

      // Save user message (with GitHub username)
      const settings = loadSettings();
      const userId = settings.github_username || '';
      const userMsg = addMessage(data.experimentId, 'user', data.content, undefined, userId);
      broadcastToExperiment(data.experimentId, {
        type: 'message',
        message: userMsg,
      });

      // Build memory context from recent history (excludes the current user message)
      const recentHistory = getRecentMessages(data.experimentId, MEMORY_RECENT_PAIRS * 2 + 2);
      // Remove the last entry if it is the message we just saved (same id)
      const historyForContext = recentHistory.filter(m => m.id !== userMsg.id);
      const memoryCtx = buildMemoryContext(data.experimentId, historyForContext);
      const languageInstruction = buildOutputLanguageInstruction(settings.output_language || 'ja');
      const basePrompt = memoryCtx ? memoryCtx + data.content : data.content;
      const augmentedPrompt = `${basePrompt}\n\n[Output Language]\n${languageInstruction}`;

      // Create task for parallel tracking
      const taskId = generateTaskId();
      const task: ActiveTask = {
        id: taskId,
        experimentId: data.experimentId,
        sourcePrompt: data.content,
        prompt: data.content.slice(0, 100),
        status: 'running',
        startedAt: new Date().toISOString(),
        streamingText: '',
        _statusHistory: [],
      };
      const benchmark = matchBenchmarkDefinition(data.content);
      const requestedBenchmarkId = String(data.benchmarkId || '').trim();
      const requestedSkillImprovement = data.skillImprovement && data.skillImprovement.enabled
        ? {
            benchmarkId: String(data.skillImprovement.benchmarkId || requestedBenchmarkId).trim(),
            note: String(data.skillImprovement.note || '').trim(),
          }
        : null;
      let benchmarkContext: ReturnType<typeof createBenchmarkRunContext> | null = null;

      if (benchmark) {
        benchmarkContext = createBenchmarkRunContext(
          data.experimentId,
          taskId,
          data.content,
          task.startedAt,
          benchmark,
          { mode: 'canonical' },
        );
      } else if (requestedSkillImprovement?.benchmarkId) {
        const targetBenchmark = getBenchmarkDefinitionById(requestedSkillImprovement.benchmarkId);
        if (targetBenchmark) {
          benchmarkContext = createBenchmarkRunContext(
            data.experimentId,
            taskId,
            data.content,
            task.startedAt,
            targetBenchmark,
            {
              mode: 'skill-improvement',
              skillImprovementNote: requestedSkillImprovement.note,
            },
          );
        }
      } else if (requestedBenchmarkId) {
        const targetBenchmark = getBenchmarkDefinitionById(requestedBenchmarkId);
        if (targetBenchmark) {
          benchmarkContext = createBenchmarkRunContext(
            data.experimentId,
            taskId,
            data.content,
            task.startedAt,
            targetBenchmark,
            { mode: 'prompt-run' },
          );
        }
      }

      if (benchmarkContext) {
        task.benchmarkRunId = benchmarkContext.manifest.runId;
        task.benchmarkMode = benchmarkContext.manifest.mode;
        task.benchmarkDefinitionId = benchmarkContext.manifest.benchmarkDefinitionId;
        task.benchmarkDefinitionTitle = benchmarkContext.manifest.benchmarkDefinitionTitle;
        task.benchmarkLabel = benchmarkContext.manifest.promptLabel;
        task.benchmarkPromptSource = benchmarkContext.manifest.promptSource;
        task.benchmarkRequiredArtifacts = benchmarkContext.requiredArtifacts;
        task.skillImprovementNote = benchmarkContext.manifest.skillImprovementNote;
        task.skillSnapshot = benchmarkContext.skillSnapshot;
        writeBenchmarkRunManifest(data.experimentId, benchmarkContext.manifest.runId, benchmarkContext.manifest);
        if (benchmarkContext.skillSnapshot) {
          writeBenchmarkSkillSnapshot(data.experimentId, benchmarkContext.manifest.runId, benchmarkContext.skillSnapshot);
        }
      }
      activeTasks.set(taskId, task);
      syncProcessHistory(task);
      persistAndBroadcastActivity(task, buildTaskActivityEvent(task, 'task', 'start', 'Task started', {
        status: 'running',
        taskPrompt: task.prompt,
      }));

      broadcastToExperiment(data.experimentId, { type: 'agent_start', taskId });
      broadcastTasks();

      // Start heartbeat: send periodic agent_status while agent is running.
      // This ensures the client receives updates even after reconnect/reload.
      const heartbeatExpId = data.experimentId;
      task._heartbeat = setInterval(() => {
        if (task.status !== 'running') {
          clearInterval(task._heartbeat);
          task._heartbeat = undefined;
          return;
        }
        if (task._lastStatus || task._heartbeatSent) {
          return;
        }
        task._heartbeatSent = true;
        broadcastToExperiment(heartbeatExpId, {
          type: 'agent_status',
          taskId,
          status: '__heartbeat__',
        });
      }, 3000);

      // Run agent (non-blocking — multiple can run in parallel)
      if (agentRunner) {
        agentRunner(
          data.experimentId,
          taskId,
          augmentedPrompt,
          (chunk: string) => {
            if (task.status === 'cancelled') return;
            task.streamingText += chunk;
            // Save/update streaming message in DB so it survives reload
            if (!task.streamingMsgId) {
              const msg = addMessage(data.experimentId, 'assistant', task.streamingText, { streaming: true });
              task.streamingMsgId = msg.id;
            } else {
              updateMessageContent(task.streamingMsgId, task.streamingText);
            }
            broadcastToExperiment(data.experimentId, {
              type: 'agent_chunk',
              taskId,
              chunk,
            });
          },
          (fullResponse: string) => {
            if (task.status === 'cancelled') return;
            if (task._heartbeat) { clearInterval(task._heartbeat); task._heartbeat = undefined; }
            task.status = 'done';
            task.finishedAt = new Date().toISOString();
            // Replace streaming message with final version
            if (task.streamingMsgId) {
              updateMessageContent(task.streamingMsgId, fullResponse);
            }
            const assistantMsg = task.streamingMsgId
              ? { id: task.streamingMsgId, experiment_id: data.experimentId, role: 'assistant' as const, content: fullResponse, timestamp: new Date().toISOString() }
              : addMessage(data.experimentId, 'assistant', fullResponse);
            task.finalMessage = assistantMsg;
            appendTerminalProcessLog(task.experimentId, {
              id: task.id,
              experimentId: task.experimentId,
              prompt: task.prompt,
              status: 'done',
              startedAt: task.startedAt,
              finishedAt: task.finishedAt,
              _lastStatus: task._lastStatus,
              _statusHistory: task._statusHistory,
            }, 'completed');
            persistAndBroadcastActivity(task, buildTaskActivityEvent(task, 'task', 'complete', 'Task completed', {
              status: 'done',
              taskPrompt: task.prompt,
            }));
            appendCompletedProcessHistory(task.experimentId, {
              id: task.id,
              experimentId: task.experimentId,
              prompt: task.prompt,
              status: 'running',
              startedAt: task.startedAt,
              finishedAt: task.finishedAt,
              _lastStatus: task._lastStatus,
              _statusHistory: task._statusHistory,
            }, fullResponse);
            finalizeBenchmarkRun(task, fullResponse);
            syncProcessHistory(task);
            broadcastToExperiment(data.experimentId, {
              type: 'agent_done',
              taskId,
              message: assistantMsg,
            });
            broadcastTasks();
            // Notify client of updated memory state
            const updatedMemory = getMemory(data.experimentId);
            broadcastToExperiment(data.experimentId, {
              type: 'memory_update',
              memory: updatedMemory ?? { experiment_id: data.experimentId, summary: '', summarized_count: 0 },
            });
            // Trigger async memory summarisation if threshold reached
            setTimeout(() => maybeTriggerSummarization(data.experimentId), 100);
            // Clean up after a delay
            setTimeout(() => activeTasks.delete(taskId), 60000);
          },
          (error: string) => {
            if (task.status === 'cancelled') return;
            if (task._heartbeat) { clearInterval(task._heartbeat); task._heartbeat = undefined; }
            task.status = 'error';
            task.finishedAt = new Date().toISOString();
            appendTerminalProcessLog(task.experimentId, {
              id: task.id,
              experimentId: task.experimentId,
              prompt: task.prompt,
              status: 'error',
              startedAt: task.startedAt,
              finishedAt: task.finishedAt,
              _lastStatus: task._lastStatus,
              _statusHistory: task._statusHistory,
            }, error);
            persistAndBroadcastActivity(task, buildTaskActivityEvent(task, 'task', 'error', `Task failed: ${error}`, {
              status: 'error',
              taskPrompt: task.prompt,
            }));
            finalizeBenchmarkRun(task, error);
            syncProcessHistory(task);
            const errMsg = addMessage(data.experimentId, 'system', `Error: ${error}`);
            broadcastToExperiment(data.experimentId, {
              type: 'agent_error',
              taskId,
              error,
              message: errMsg,
            });
            broadcastTasks();
            setTimeout(() => activeTasks.delete(taskId), 60000);
          },
          (statusLine: string) => {
            if (task.status === 'cancelled') return;
            const now = Date.now();
            if (task._lastStatus === statusLine) return;
            if (task._lastStatusAt && now - task._lastStatusAt < 2000 && statusLine === 'Copilot is analyzing the task') return;
            task._lastStatus = statusLine;
            task._lastStatusAt = now;
            if (statusLine !== '__heartbeat__') {
              const statusMessage = statusLine === '__container_spawned__'
                ? 'Container starting'
                : statusLine;
              const lastEntry = task._statusHistory?.[task._statusHistory.length - 1];
              if (!lastEntry || lastEntry.message !== statusMessage) {
                task._statusHistory = [...(task._statusHistory ?? []), {
                  message: statusMessage,
                  timestamp: new Date(now).toISOString(),
                }];
              }
            }
            const activityEvent = parseStatusLineActivity(task, statusLine);
            if (activityEvent) {
              persistAndBroadcastActivity(task, activityEvent);
            }
            syncProcessHistory(task);
            broadcastToExperiment(data.experimentId, {
              type: 'agent_status',
              taskId,
              status: statusLine,
            });
          },
        );
      } else {
        task.status = 'done';
        task.finishedAt = new Date().toISOString();
        const reply = addMessage(
          data.experimentId,
          'assistant',
          `[No agent configured] Received: ${data.content}`,
        );
        appendCompletedProcessHistory(task.experimentId, {
          id: task.id,
          experimentId: task.experimentId,
          prompt: task.prompt,
          status: 'running',
          startedAt: task.startedAt,
          finishedAt: task.finishedAt,
          _lastStatus: task._lastStatus,
          _statusHistory: task._statusHistory,
        }, reply.content);
        finalizeBenchmarkRun(task, reply.content);
        persistAndBroadcastActivity(task, buildTaskActivityEvent(task, 'task', 'complete', 'Task completed', {
          status: 'done',
          taskPrompt: task.prompt,
        }));
        syncProcessHistory(task);
        broadcastToExperiment(data.experimentId, {
          type: 'agent_done',
          taskId,
          message: reply,
        });
        broadcastTasks();
        setTimeout(() => activeTasks.delete(taskId), 60000);
      }
    }

    // Stop a running task
    if (data.type === 'stop' && data.taskId) {
      const task = activeTasks.get(data.taskId);
      if (task && task.status === 'running') {
        if (task._heartbeat) { clearInterval(task._heartbeat); task._heartbeat = undefined; }
        task.status = 'cancelled';
        task.finishedAt = new Date().toISOString();
        appendTerminalProcessLog(task.experimentId, {
          id: task.id,
          experimentId: task.experimentId,
          prompt: task.prompt,
          status: 'cancelled',
          startedAt: task.startedAt,
          finishedAt: task.finishedAt,
          _lastStatus: task._lastStatus,
          _statusHistory: task._statusHistory,
        }, 'Task cancelled by user.');
        persistAndBroadcastActivity(task, buildTaskActivityEvent(task, 'task', 'cancel', 'Task cancelled by user.', {
          status: 'cancelled',
          taskPrompt: task.prompt,
        }));
        finalizeBenchmarkRun(task, '');
        syncProcessHistory(task);
        if (agentStopper) {
          agentStopper(task.experimentId, data.taskId);
        }
        const cancelMsg = addMessage(task.experimentId, 'system', 'Task cancelled by user.');
        broadcastToExperiment(task.experimentId, {
          type: 'agent_cancelled',
          taskId: data.taskId,
          message: cancelMsg,
        });
        broadcastTasks();
        setTimeout(() => activeTasks.delete(data.taskId), 60000);
      }
    }

    // Subscribe to an experiment (client switched to this group)
    if (data.type === 'subscribe' && data.experimentId) {
      clientSubscriptions.set(ws, data.experimentId as string);
      // Replay any recently-completed tasks that this client may have missed
      // (e.g. WebSocket was disconnected while the agent was running)
      for (const task of activeTasks.values()) {
        if (task.experimentId !== data.experimentId) continue;
        if (task.status === 'done' && task.finalMessage) {
          ws.send(JSON.stringify({
            experimentId: task.experimentId,
            type: 'agent_done',
            taskId: task.id,
            message: task.finalMessage,
          }));
        } else if (task.status === 'error') {
          // error tasks don't need replay as they already have a system message in DB
        }
      }
    }

    // List active tasks
    if (data.type === 'list_tasks') {
      const tasks = Array.from(activeTasks.values(), serializeTask);
      ws.send(JSON.stringify({ type: 'tasks', tasks }));
    }
  } catch (err) {
    logger.error({ err }, 'WebSocket message error');
    ws.send(JSON.stringify({ type: 'error', error: 'Invalid message' }));
  }
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Component version management
// ---------------------------------------------------------------------------

// Capture the running version at startup (won't change until process restarts)
const RUNNING_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')).version || 'unknown';
  } catch { return 'unknown'; }
})();

function getComponentVersions(): Record<string, { version: string; description: string }> {
  const versions: Record<string, { version: string; description: string }> = {};

  // CoreClaw (show running version)
  versions.coreclaw = { version: RUNNING_VERSION, description: 'CoreClaw' };

  // GitHub Copilot CLI
  try {
    const out = execSync('copilot --version 2>&1', { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0];
    const match = out.match(/(\d+\.\d+\.\d+)/);
    versions.copilot = { version: match ? match[1] : out, description: 'GitHub Copilot CLI' };
  } catch {
    versions.copilot = { version: 'not installed', description: '' };
  }

  return versions;
}

async function checkComponentUpdate(component: string): Promise<{ available: boolean; current: string; latest?: string; message: string }> {
  const projectRoot = process.cwd();
  try {
    switch (component) {
      case 'coreclaw': {
        const gitEnv = { GIT_TERMINAL_PROMPT: '0' };
        try {
          execSync('git fetch origin main 2>&1', { cwd: projectRoot, encoding: 'utf-8', timeout: 30000, env: { ...process.env, ...gitEnv } });
        } catch {
          return { available: false, current: RUNNING_VERSION, message: 'Failed to fetch from remote.' };
        }
        const local = execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }).trim();
        const remote = execSync('git rev-parse origin/main', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }).trim();
        const diskPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));

        // Check if code on disk is newer than running process (needs restart)
        if (diskPkg.version !== RUNNING_VERSION) {
          return { available: true, current: RUNNING_VERSION, latest: diskPkg.version, message: `v${diskPkg.version} ready (restart needed)` };
        }

        if (local === remote) {
          return { available: false, current: RUNNING_VERSION, message: 'Up to date' };
        }
        // Remote has new commits
        let remoteVer = '';
        try {
          remoteVer = execSync('git show origin/main:package.json 2>/dev/null', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 });
          remoteVer = JSON.parse(remoteVer).version || '';
        } catch { remoteVer = ''; }
        return { available: true, current: RUNNING_VERSION, latest: remoteVer || undefined, message: remoteVer ? `v${remoteVer} available` : 'Update available' };
      }
      case 'copilot': {
        const out = execSync('copilot update --check 2>&1 || copilot --version 2>&1', { encoding: 'utf-8', timeout: 30000 }).trim();
        const curMatch = execSync('copilot --version 2>&1', { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0].match(/(\d+\.\d+\.\d+)/);
        const current = curMatch ? curMatch[1] : 'unknown';
        if (out.includes('No update needed')) {
          return { available: false, current, message: 'Up to date' };
        }
        const latestMatch = out.match(/latest release is v?(\d+\.\d+\.\d+)/);
        const latest = latestMatch ? latestMatch[1] : undefined;
        if (latest && latest === current) {
          return { available: false, current, message: 'Up to date' };
        }
        return { available: !!latest && latest !== current, current, latest, message: latest ? `v${latest} available` : 'Up to date' };
      }
      default:
        return { available: false, current: 'unknown', message: `Unknown component: ${component}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { available: false, current: 'unknown', message: `Check failed: ${msg.slice(0, 100)}` };
  }
}

async function updateComponent(component: string): Promise<{ ok: boolean; message: string; version?: string; restart?: boolean }> {
  const projectRoot = process.cwd();

  try {
    switch (component) {
      case 'coreclaw': {
        logger.info('Updating CoreClaw...');
        const projectRoot = process.cwd();
        const gitEnv = { GIT_TERMINAL_PROMPT: '0' };
        try {
          execSync('git fetch origin main 2>&1', { cwd: projectRoot, encoding: 'utf-8', timeout: 30000, env: { ...process.env, ...gitEnv } });
        } catch (fetchErr) {
          return { ok: false, message: 'Failed to fetch from remote. Check network and git configuration.' };
        }
        const local = execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }).trim();
        const remote = execSync('git rev-parse origin/main', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }).trim();
        const diskPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));

        // Code already up to date but server needs restart
        if (local === remote && diskPkg.version !== RUNNING_VERSION) {
          setTimeout(() => {
            logger.info('Sending SIGHUP to restart server for pending update...');
            requestProcessRestart('pending-coreclaw-update');
          }, 1500);
          return { ok: true, message: `Restarting to apply v${diskPkg.version}...`, version: diskPkg.version, restart: true };
        }

        if (local === remote) {
          return { ok: true, message: `CoreClaw v${RUNNING_VERSION} is already up to date`, version: RUNNING_VERSION };
        }

        const statusOutput = execSync('git status --porcelain', { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 });
        const dirtyFiles = parseDirtyTrackedFiles(statusOutput);
        const { autoClean, blocking } = classifyUpdaterDirtyFiles(dirtyFiles);

        if (blocking.length) {
          return {
            ok: false,
            message: `Update blocked by local changes: ${blocking.join(', ')}. Commit, stash, or discard them first.`,
          };
        }

        for (const file of autoClean) {
          const restore = spawnSync('git', ['restore', '--source=HEAD', '--staged', '--worktree', '--', file], {
            cwd: projectRoot,
            encoding: 'utf-8',
            timeout: 5000,
          });
          if (restore.status !== 0) {
            throw new Error((restore.stderr || restore.stdout || `Failed to clean ${file}`).trim());
          }
        }

        if (autoClean.length) {
          logger.info({ files: autoClean }, 'Cleaned auto-generated local files before CoreClaw update');
        }

        execSync('git pull origin main 2>&1', { cwd: projectRoot, encoding: 'utf-8', timeout: 60000, env: { ...process.env, ...gitEnv } });
        execSync('npm install 2>&1', { cwd: projectRoot, encoding: 'utf-8', timeout: 120000 });
        execSync('npm run build 2>&1', { cwd: projectRoot, encoding: 'utf-8', timeout: 120000 });

        // Check if container/ files changed and rebuild Docker image if needed
        let containerRebuilt = false;
        try {
          const diff = execSync(`git diff --name-only ${local} HEAD -- container/`, { cwd: projectRoot, encoding: 'utf-8', timeout: 5000 }).trim();
          if (diff) {
            logger.info({ files: diff.split('\n').length }, 'Container files changed — rebuilding Docker image...');
            execSync(`docker build --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) -t coreclaw-agent:latest ${path.join(projectRoot, 'container')} 2>&1`, {
              encoding: 'utf-8', timeout: 300000,
            });
            containerRebuilt = true;
          }
        } catch (dockerErr) {
          logger.warn({ err: dockerErr }, 'Docker image rebuild failed (non-fatal)');
        }

        const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
        const rebuildMsg = containerRebuilt ? ' Container image rebuilt.' : '';
        // Schedule server restart after response is sent
        setTimeout(() => {
          logger.info('Sending SIGHUP to restart server after CoreClaw update...');
          requestProcessRestart('coreclaw-update');
        }, 1500);
        return { ok: true, message: `CoreClaw updated to v${pkg.version}.${rebuildMsg} Restarting server...`, version: pkg.version, restart: true };
      }

      case 'copilot': {
        logger.info('Updating GitHub Copilot CLI...');
        const updateOut = execSync('copilot update 2>&1', { encoding: 'utf-8', timeout: 120000 }).trim();
        const out = execSync('copilot --version 2>&1', { encoding: 'utf-8', timeout: 5000 }).trim().split('\n')[0];
        const match = out.match(/(\d+\.\d+\.\d+)/);
        const ver = match ? match[1] : 'latest';
        const noUpdate = updateOut.includes('No update needed');
        if (noUpdate) {
          return { ok: true, message: `Copilot CLI v${ver} is already up to date`, version: ver };
        }
        // Rebuild agent container with latest Copilot
        logger.info('Rebuilding agent container...');
        execSync(`docker build --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) -t coreclaw-agent:latest ${path.join(projectRoot, 'container')} 2>&1`, {
          encoding: 'utf-8', timeout: 300000,
        });
        return { ok: true, message: `Copilot CLI updated to v${ver}, container rebuilt`, version: ver };
      }

      default:
        return { ok: false, message: `Unknown component: ${component}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ component, err }, 'Component update failed');
    return { ok: false, message: `Update failed: ${msg.slice(0, 200)}` };
  }
}

export const WEB_PORT = parseInt(process.env.CORECLAW_WEB_PORT || process.env.WEB_PORT || '3000', 10);

// Reference to the active HTTP server — used by performProcessRestart() to drain
// connections before spawning the replacement process.
let activeHttpServer: import('http').Server | null = null;
let restartInProgress = false;
let restartSignalArmed = false;

/**
 * Gracefully restart the current process after a restart signal is received:
 *   1. Close the HTTP server so the OS releases the port.
 *   2. Spawn a new child with identical argv + env (port numbers propagated).
 *   3. Exit the current process.
 *
 * A 3-second hard-timeout forces exit if connections do not drain in time,
 * preventing the new process from hitting EADDRINUSE.
 */
export function restartCurrentProcess(): void {
  if (restartInProgress) return;
  restartInProgress = true;

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CORECLAW_WEB_PORT: String(WEB_PORT),
    CREDENTIAL_PROXY_PORT: String(process.env.CREDENTIAL_PROXY_PORT || '3001'),
  };

  const spawnArgs = [...process.execArgv, ...process.argv.slice(1)];

  const doSpawn = () => {
    const child = spawn(process.execPath, spawnArgs, {
      env,
      stdio: 'inherit',
      detached: true,
    });
    child.unref();
    process.exit(0);
  };

  if (activeHttpServer && activeHttpServer.listening) {
    // Hard-kill timeout: if connections linger longer than 3 s, force-spawn anyway
    const hardKill = setTimeout(doSpawn, 3000);
    activeHttpServer.close(() => {
      clearTimeout(hardKill);
      logger.info('HTTP server closed — spawning new process');
      doSpawn();
    });
  } else {
    doSpawn();
  }
}

function requestProcessRestart(reason: string): void {
  if (restartInProgress || restartSignalArmed) return;

  restartSignalArmed = true;
  const onRestartSignal = () => {
    restartSignalArmed = false;
    logger.info({ reason, pid: process.pid }, 'Received SIGHUP restart signal');
    if (appRestart) {
      void appRestart(reason).catch((err) => {
        restartInProgress = false;
        logger.error({ err, reason }, 'App restart callback failed');
      });
      return;
    }
    restartCurrentProcess();
  };

  process.once('SIGHUP', onRestartSignal);

  try {
    logger.info({ reason, pid: process.pid }, 'Sending SIGHUP to request process restart');
    process.kill(process.pid, 'SIGHUP');
  } catch (err) {
    restartSignalArmed = false;
    process.removeListener('SIGHUP', onRestartSignal);
    throw err;
  }
}

export function startWebServer(port = WEB_PORT): Promise<void> {
  // Initialize experiments database
  initExperimentsDb(getDatabase());
  const staleCount = drainStaleRunningProcessHistory();
  if (staleCount > 0) {
    logger.info({ staleCount }, 'Drained stale running process history entries');
  }

  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        logger.error({ err }, 'Request handler error');
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal Server Error' }));
        }
      });
    });

    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
      // Initialize with empty subscription; client sends 'subscribe' when it selects a group
      clientSubscriptions.set(ws, '');
      logger.debug('WebSocket client connected');

      ws.on('message', (raw) => handleWsMessage(ws, raw.toString()));
      ws.on('close', () => {
        clientSubscriptions.delete(ws);
        logger.debug('WebSocket client disconnected');
      });
    });

    server.listen(port, () => {
      activeHttpServer = server;
      logger.info({ port }, 'Web server started — http://localhost:' + port);
      void getCachedCopilotAuthStatus(true);
      resolve();
    });
  });
}
