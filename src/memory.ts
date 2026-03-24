/**
 * Conversation memory management for CoreClaw.
 *
 * Each Chat Group (experiment) maintains:
 *  - A rolling summary of older messages (stored in experiment_memory table)
 *  - A recent-message window always appended verbatim to the context
 *
 * When the total message count exceeds MEMORY_SUMMARIZE_THRESHOLD the server
 * schedules an asynchronous summarisation pass using the same agentRunner,
 * so no additional AI provider dependency is needed.
 */

import Database from 'better-sqlite3';
import { ExperimentMessage } from './experiments.js';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Public constants (can be tuned as needed)
// ---------------------------------------------------------------------------

/** Number of recent user/assistant pairs to always include verbatim. */
export const MEMORY_RECENT_PAIRS = 5;

/**
 * Total message count (user + assistant only) that triggers auto-summarisation.
 * Summarisation fires when there are more than this many messages in total AND
 * enough unsummarised messages to be worth compressing.
 */
export const MEMORY_SUMMARIZE_THRESHOLD = 20;

/** Hard cap on the injected context block (characters). */
export const MEMORY_MAX_CONTEXT_CHARS = 8000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExperimentMemory {
  experiment_id: string;
  summary: string;
  /** How many messages (row-count in experiment_messages) are already represented in the summary. */
  summarized_count: number;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

let memDb: Database.Database | null = null;

export function initMemoryDb(database: Database.Database): void {
  memDb = database;
  database.exec(`
    CREATE TABLE IF NOT EXISTS experiment_memory (
      experiment_id TEXT PRIMARY KEY,
      summary       TEXT    DEFAULT '',
      summarized_count INTEGER DEFAULT 0,
      updated_at    TEXT    NOT NULL
    );
  `);
}

function getMemDb(): Database.Database {
  if (!memDb) throw new Error('Memory DB not initialized – call initMemoryDb first');
  return memDb;
}

// ---------------------------------------------------------------------------
// Memory read / write
// ---------------------------------------------------------------------------

export function getMemory(experimentId: string): ExperimentMemory | null {
  return getMemDb()
    .prepare('SELECT * FROM experiment_memory WHERE experiment_id = ?')
    .get(experimentId) as ExperimentMemory | null;
}

export function setMemorySummary(
  experimentId: string,
  summary: string,
  summarizedCount: number,
): void {
  const now = new Date().toISOString();
  getMemDb()
    .prepare(`
      INSERT INTO experiment_memory (experiment_id, summary, summarized_count, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(experiment_id) DO UPDATE SET
        summary          = excluded.summary,
        summarized_count = excluded.summarized_count,
        updated_at       = excluded.updated_at
    `)
    .run(experimentId, summary, summarizedCount, now);
  logger.debug({ experimentId, summarizedCount }, 'Memory summary saved');
}

export function clearMemory(experimentId: string): void {
  getMemDb()
    .prepare('DELETE FROM experiment_memory WHERE experiment_id = ?')
    .run(experimentId);
  logger.info({ experimentId }, 'Memory cleared');
}

// ---------------------------------------------------------------------------
// Context building
// ---------------------------------------------------------------------------

/**
 * Build the context block that is prepended to the user's prompt.
 *
 * @param experimentId  The experiment to build context for.
 * @param recentMessages  Recent messages fetched by the caller (should NOT
 *   include the current user message that is about to be sent, only history).
 * @returns  A formatted context string, or empty string if there is no history.
 */
export function buildMemoryContext(
  experimentId: string,
  recentMessages: ExperimentMessage[],
): string {
  const memory = getMemory(experimentId);
  const hasSummary = memory && memory.summary.trim().length > 0;

  // Filter to user/assistant only; skip streaming-incomplete assistant messages
  const relevant = recentMessages.filter((m) => {
    if (m.role === 'system') return false;
    if (m.role === 'assistant') {
      try {
        const meta = m.metadata ? JSON.parse(m.metadata) : {};
        if (meta.streaming) return false;
      } catch { /* ignore */ }
    }
    return true;
  });

  if (!hasSummary && relevant.length === 0) return '';

  const lines: string[] = [];
  lines.push('<conversation_memory>');

  if (hasSummary) {
    lines.push('## これまでの会話の要約');
    lines.push(memory!.summary.trim());
    lines.push('');
  }

  if (relevant.length > 0) {
    lines.push('## 直近の会話履歴');
    for (const m of relevant) {
      const label = m.role === 'user' ? 'ユーザー' : 'アシスタント';
      const content =
        m.content.length > 2000
          ? m.content.slice(0, 2000) + '…（省略）'
          : m.content;
      lines.push(`[${label}]: ${content}`);
    }
    lines.push('');
  }

  lines.push('</conversation_memory>');
  lines.push('');
  lines.push('上記の会話履歴を踏まえて、以下のメッセージに回答してください:');
  lines.push('');

  const ctx = lines.join('\n');
  if (ctx.length > MEMORY_MAX_CONTEXT_CHARS) {
    return (
      ctx.slice(0, MEMORY_MAX_CONTEXT_CHARS) +
      '\n…（コンテキスト省略）\n\n上記の会話履歴を踏まえて、以下のメッセージに回答してください:\n\n'
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Summarisation helpers
// ---------------------------------------------------------------------------

/**
 * Returns true when there are enough unsummarised messages to warrant
 * running a compaction pass.
 */
export function needsSummarization(
  experimentId: string,
  totalMessageCount: number,
): boolean {
  if (totalMessageCount < MEMORY_SUMMARIZE_THRESHOLD) return false;
  const memory = getMemory(experimentId);
  const alreadySummarized = memory?.summarized_count ?? 0;
  const unsummarized = totalMessageCount - alreadySummarized;
  // Only compact when there are noticeably more messages than the recent window
  return unsummarized > MEMORY_RECENT_PAIRS * 2 + 2;
}

/**
 * Build the prompt sent to the agent for summarisation.
 *
 * @param messagesToSummarize  Messages that should be folded into the summary.
 * @param existingSummary      The current summary (may be empty).
 */
export function buildSummarizationPrompt(
  messagesToSummarize: ExperimentMessage[],
  existingSummary: string,
): string {
  const lines: string[] = [];

  if (existingSummary.trim()) {
    lines.push('これまでの会話の要約:');
    lines.push(existingSummary.trim());
    lines.push('');
    lines.push('以下の新しい会話を上の要約に統合してください:');
  } else {
    lines.push('以下の会話を要約してください:');
  }

  lines.push('');
  for (const m of messagesToSummarize) {
    if (m.role === 'system') continue;
    const label = m.role === 'user' ? 'ユーザー' : 'アシスタント';
    const content =
      m.content.length > 1500 ? m.content.slice(0, 1500) + '…（省略）' : m.content;
    lines.push(`[${label}]: ${content}`);
  }
  lines.push('');
  lines.push(
    '上記の会話の重要なポイントを300〜500字程度の日本語で簡潔に要約してください。',
  );
  lines.push(
    '要約には、主要なトピック、決定事項、技術的な詳細（コード・ファイル名・設定値など）を含めてください。',
  );
  lines.push('要約文のみを出力してください。前置きや説明文は不要です。');

  return lines.join('\n');
}
