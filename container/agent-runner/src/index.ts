/**
 * CoreClaw Agent Runner
 * Runs inside a container, receives config via stdin, invokes GitHub Copilot CLI
 *
 * Input protocol:
 *   Stdin: Full ContainerInput JSON (read until EOF)
 *   IPC:   Follow-up messages as JSON files in /workspace/ipc/input/
 *          Sentinel: /workspace/ipc/input/_close — signals session end
 *
 * Stdout protocol:
 *   Each result is wrapped in OUTPUT_START_MARKER / OUTPUT_END_MARKER pairs.
 */

import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
}

interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

interface WorkspaceSnapshotEntry {
  size: number;
  mtimeMs: number;
}

const IPC_INPUT_DIR = '/workspace/ipc/input';
const IPC_INPUT_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');
const IPC_POLL_MS = 500;

const OUTPUT_START_MARKER = '---CORECLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---CORECLAW_OUTPUT_END---';

function writeOutput(output: ContainerOutput): void {
  console.log(OUTPUT_START_MARKER);
  console.log(JSON.stringify(output));
  console.log(OUTPUT_END_MARKER);
}

function log(message: string): void {
  console.error(`[agent-runner] ${message}`);
}

function truncateForLog(text: string, limit = 180): string {
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function shouldIgnoreWorkspacePath(relativePath: string): boolean {
  const topLevel = relativePath.split('/').filter(Boolean)[0] || '';
  return ['.copilot', '.github', 'logs', 'node_modules'].includes(topLevel);
}

function snapshotWorkspace(rootDir: string): Map<string, WorkspaceSnapshotEntry> {
  const snapshot = new Map<string, WorkspaceSnapshotEntry>();

  const visit = (dir: string, prefix: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (shouldIgnoreWorkspacePath(relativePath)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath, relativePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = fs.statSync(fullPath);
      snapshot.set(relativePath, {
        size: stat.size,
        mtimeMs: Math.floor(stat.mtimeMs),
      });
    }
  };

  if (fs.existsSync(rootDir)) {
    visit(rootDir, '');
  }

  return snapshot;
}

function diffWorkspaceSnapshots(
  before: Map<string, WorkspaceSnapshotEntry>,
  after: Map<string, WorkspaceSnapshotEntry>,
): string[] {
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  for (const [relativePath, nextMeta] of after.entries()) {
    const prevMeta = before.get(relativePath);
    if (!prevMeta) {
      created.push(relativePath);
      continue;
    }
    if (prevMeta.size !== nextMeta.size || prevMeta.mtimeMs !== nextMeta.mtimeMs) {
      modified.push(relativePath);
    }
  }

  for (const relativePath of before.keys()) {
    if (!after.has(relativePath)) {
      deleted.push(relativePath);
    }
  }

  const messages: string[] = [];
  const pushChanges = (label: string, files: string[]) => {
    const limit = 12;
    for (const file of files.slice(0, limit)) {
      messages.push(`${label}: ${file}`);
    }
    if (files.length > limit) {
      messages.push(`${label}: ${files.length - limit} more files`);
    }
  };

  pushChanges('Created file', created.sort());
  pushChanges('Modified file', modified.sort());
  pushChanges('Deleted file', deleted.sort());

  return messages;
}

function extractPatchTargets(input: string): string[] {
  const targets = input
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('*** Add File:') || line.startsWith('*** Update File:') || line.startsWith('*** Delete File:'))
    .map((line) => line.replace(/^\*\*\*\s+(?:Add|Update|Delete) File:\s+/, '').trim());
  return [...new Set(targets)].slice(0, 8);
}

function summarizeToolStart(toolName: string, args: Record<string, unknown>): string[] {
  const details: string[] = [];
  const command = typeof args.command === 'string' ? args.command.trim() : '';
  const filePath = typeof args.filePath === 'string' ? args.filePath.trim() : '';
  const dirPath = typeof args.dirPath === 'string' ? args.dirPath.trim() : '';
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  const includePattern = typeof args.includePattern === 'string' ? args.includePattern.trim() : '';
  const input = typeof args.input === 'string' ? args.input : '';

  switch (toolName) {
    case 'run_in_terminal':
      if (command) details.push(`Executing command: ${truncateForLog(command, 220)}`);
      break;
    case 'read_file':
      if (filePath) {
        const start = typeof args.startLine === 'number' ? args.startLine : null;
        const end = typeof args.endLine === 'number' ? args.endLine : null;
        details.push(`Reading file: ${filePath}${start && end ? ` (${start}-${end})` : ''}`);
      }
      break;
    case 'create_file':
      if (filePath) details.push(`Creating file: ${filePath}`);
      break;
    case 'create_directory':
      if (dirPath) details.push(`Creating directory: ${dirPath}`);
      break;
    case 'apply_patch':
      for (const target of extractPatchTargets(input)) {
        details.push(`Updating file: ${target}`);
      }
      break;
    case 'grep_search':
      if (query) details.push(`Searching code: ${truncateForLog(query)}`);
      if (includePattern) details.push(`Search scope: ${includePattern}`);
      break;
    case 'file_search':
      if (query) details.push(`Searching files: ${truncateForLog(query)}`);
      break;
    case 'list_dir':
      if (typeof args.path === 'string' && args.path.trim()) {
        details.push(`Listing directory: ${args.path.trim()}`);
      }
      break;
    case 'get_errors': {
      const paths = Array.isArray(args.filePaths)
        ? args.filePaths.filter((item): item is string => typeof item === 'string').slice(0, 5)
        : [];
      if (paths.length) {
        for (const p of paths) details.push(`Checking errors: ${p}`);
      }
      break;
    }
    default:
      if (filePath) details.push(`Target file: ${filePath}`);
      if (dirPath) details.push(`Target directory: ${dirPath}`);
      if (command) details.push(`Command detail: ${truncateForLog(command, 220)}`);
      if (query) details.push(`Query detail: ${truncateForLog(query)}`);
      break;
  }

  return details.slice(0, 12);
}

function summarizeToolComplete(toolName: string, data: Record<string, unknown>): string[] {
  const success = data.success !== false;
  const details: string[] = [];

  if (!success) {
    details.push(`Failed ${toolName}`);
    return details;
  }

  if (toolName === 'run_in_terminal') {
    details.push('Command finished');
    return details;
  }

  if (toolName === 'apply_patch') {
    details.push('File update finished');
    return details;
  }

  details.push(`Completed ${toolName}`);
  return details;
}

async function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function shouldClose(): boolean {
  if (fs.existsSync(IPC_INPUT_CLOSE_SENTINEL)) {
    try {
      fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL);
    } catch {
      /* ignore */
    }
    return true;
  }
  return false;
}

function drainIpcInput(): string[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs
      .readdirSync(IPC_INPUT_DIR)
      .filter((f) => f.endsWith('.json'))
      .sort();

    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        fs.unlinkSync(filePath);
        if (data.type === 'message' && data.text) {
          messages.push(data.text);
        }
      } catch (err) {
        log(
          `Failed to process input file ${file}: ${err instanceof Error ? err.message : String(err)}`,
        );
        try {
          fs.unlinkSync(filePath);
        } catch {
          /* ignore */
        }
      }
    }
    return messages;
  } catch (err) {
    log(`IPC drain error: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function waitForIpcMessage(): Promise<string | null> {
  return new Promise((resolve) => {
    const poll = () => {
      if (shouldClose()) {
        resolve(null);
        return;
      }
      const messages = drainIpcInput();
      if (messages.length > 0) {
        resolve(messages.join('\n'));
        return;
      }
      setTimeout(poll, IPC_POLL_MS);
    };
    poll();
  });
}

/**
 * Run Copilot CLI with a prompt and capture its output.
 * Uses `copilot -p` for non-interactive mode with JSONL streaming output.
 */
async function runCopilotQuery(
  prompt: string,
  containerInput: ContainerInput,
): Promise<{ output: string; exitCode: number; workspaceChanges: string[] }> {
  return new Promise((resolve, reject) => {
    const args: string[] = [
      '-p', prompt,
      '--output-format', 'json',
      '--stream', 'on',
      '--allow-all',
    ];

    // Enable GitHub MCP tools if configured
    const mcpTools = process.env.COPILOT_GITHUB_MCP_TOOLS;
    if (mcpTools === 'all') {
      args.push('--enable-all-github-mcp-tools');
    } else if (mcpTools) {
      for (const toolset of mcpTools.split(',').map(s => s.trim()).filter(Boolean)) {
        args.push('--add-github-mcp-toolset', toolset);
      }
    }

    // Pass custom MCP servers config if set
    const mcpConfig = process.env.COPILOT_MCP_CONFIG;
    if (mcpConfig) {
      try {
        JSON.parse(mcpConfig); // validate JSON
        const configPath = '/tmp/mcp-config.json';
        fs.writeFileSync(configPath, mcpConfig, 'utf-8');
        args.push('--additional-mcp-config', `@${configPath}`);
        log(`MCP config loaded (${mcpConfig.length} bytes)`);
      } catch (e) {
        log(`WARNING: Invalid MCP config JSON: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // Use model from environment if set
    const model = process.env.COPILOT_MODEL;
    if (model) {
      args.push('--model', model);
    }

    const cwd = '/workspace/group';
    const beforeSnapshot = snapshotWorkspace(cwd);

    log(`Running copilot with prompt (${prompt.length} chars)`);

    // Build environment — pass through tokens for authentication
    const env: Record<string, string> = { ...process.env as Record<string, string> };
    // Copilot CLI authenticates via GITHUB_TOKEN or COPILOT_GITHUB_TOKEN
    if (!env.GITHUB_TOKEN && !env.COPILOT_GITHUB_TOKEN && !env.GH_TOKEN) {
      log('WARNING: No authentication token found');
    }

    const copilot = spawn('copilot', args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    });

    let stdout = '';
    let stderr = '';
    let jsonBuffer = '';
    let accumulatedAssistantText = '';
    let finalAssistantMessage = '';

    // Track last reported step to avoid duplicate status messages
    let lastReportedStep = '';

    const emitStatus = (message: string) => {
      if (!message || message === lastReportedStep) return;
      lastReportedStep = message;
      log(message);
    };

    const parseJsonEvent = (line: string) => {
      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        return false;
      }

      const eventType = event?.type;
      const data = event?.data || {};

      switch (eventType) {
        case 'session.mcp_server_status_changed':
          if (data.serverName && data.status) {
            emitStatus(`MCP ${data.serverName}: ${data.status}`);
          }
          return true;
        case 'session.mcp_servers_loaded':
          if (Array.isArray(data.servers) && data.servers.length > 0) {
            const names = data.servers.map((server: any) => server.name).filter(Boolean).join(', ');
            emitStatus(`MCP servers loaded: ${names}`);
          }
          return true;
        case 'session.tools_updated':
          if (data.model) {
            emitStatus(`Model selected: ${data.model}`);
          }
          return true;
        case 'assistant.turn_start':
          emitStatus('Copilot is analyzing the task');
          return true;
        case 'assistant.message':
          if (typeof data.content === 'string' && data.content.trim()) {
            finalAssistantMessage = data.content.trim();
          }
          return true;
        case 'assistant.message_delta':
          if (typeof data.deltaContent === 'string' && data.deltaContent) {
            accumulatedAssistantText += data.deltaContent;
          }
          return true;
        case 'tool.execution_start': {
          const toolName = data.toolName || 'tool';
          const argsSummary = data.arguments?.description || data.arguments?.intent || data.arguments?.command || data.arguments?.query;
          const detailMessages = data.arguments && typeof data.arguments === 'object'
            ? summarizeToolStart(toolName, data.arguments as Record<string, unknown>)
            : [];
          if (detailMessages.length > 0) {
            for (const message of detailMessages) emitStatus(message);
          } else {
            emitStatus(argsSummary ? `Calling ${toolName}: ${argsSummary}` : `Calling ${toolName}`);
          }
          return true;
        }
        case 'tool.execution_complete': {
          const toolName = data.toolName || data.result?.toolName || 'tool';
          for (const message of summarizeToolComplete(toolName, data as Record<string, unknown>)) {
            emitStatus(message);
          }
          return true;
        }
        case 'result': {
          const usage = event?.usage || {};
          const apiMs = usage.totalApiDurationMs;
          const sessionMs = usage.sessionDurationMs;
          const codeChanges = usage.codeChanges;
          if (typeof usage.premiumRequests !== 'undefined') {
            log(`Total usage est: ${usage.premiumRequests} Premium request${usage.premiumRequests === 1 ? '' : 's'}`);
          }
          if (typeof apiMs === 'number') {
            log(`API time spent: ${Math.round(apiMs / 1000)}s`);
          }
          if (typeof sessionMs === 'number') {
            log(`Total session time: ${Math.round(sessionMs / 1000)}s`);
          }
          if (codeChanges && typeof codeChanges.linesAdded === 'number' && typeof codeChanges.linesRemoved === 'number') {
            log(`Total code changes: +${codeChanges.linesAdded} -${codeChanges.linesRemoved}`);
          }
          return true;
        }
        default:
          return true;
      }
    };

    copilot.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      jsonBuffer += chunk;

      let newlineIdx: number;
      while ((newlineIdx = jsonBuffer.indexOf('\n')) !== -1) {
        const rawLine = jsonBuffer.slice(0, newlineIdx);
        jsonBuffer = jsonBuffer.slice(newlineIdx + 1);
        const line = rawLine.trim();
        if (!line) continue;
        if (parseJsonEvent(line)) continue;

        const stepMatch = line.match(/^#{1,3}\s+(?:Step\s+)?(\d+)(?:[\/:]|\s+of\s+)(\d+)?[:\s]\s*(.+)/i)
          || line.match(/^\*\*(?:Step\s+)?(\d+)(?:[\/:]|\s+of\s+)(\d+)?[:\s]\s*(.+?)\*\*/i);
        if (stepMatch) {
          emitStatus(`Step ${stepMatch[1]}${stepMatch[2] ? '/' + stepMatch[2] : ''}: ${stepMatch[3]}`);
          continue;
        }

        const toolMatch = line.match(/(?:calling|using|querying|searching|downloading|fetching|accessing)\s+[`*]*([A-Za-z][\w.-]+(?:_[\w]+)*)[`*]*/i);
        if (toolMatch && toolMatch[1].length > 3) {
          emitStatus(line.length > 120 ? line.slice(0, 117) + '...' : line);
        }
      }
    });

    copilot.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      // Log stderr for debugging
      for (const line of chunk.trim().split('\n')) {
        if (line) log(line);
      }
    });

    copilot.on('close', (code) => {
      const trailing = jsonBuffer.trim();
      if (trailing) {
        parseJsonEvent(trailing);
      }
      const afterSnapshot = snapshotWorkspace(cwd);
      resolve({
        output: finalAssistantMessage || accumulatedAssistantText.trim() || stdout.trim(),
        exitCode: code ?? 1,
        workspaceChanges: diffWorkspaceSnapshots(beforeSnapshot, afterSnapshot),
      });
    });

    copilot.on('error', (err) => {
      reject(err);
    });

    // Close stdin since we pass prompt via args
    copilot.stdin.end();
  });
}

/**
 * Generate a simple session ID based on timestamp.
 */
function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function main(): Promise<void> {
  let containerInput: ContainerInput;

  try {
    const stdinData = await readStdin();
    containerInput = JSON.parse(stdinData);
    try {
      fs.unlinkSync('/tmp/input.json');
    } catch {
      /* may not exist */
    }
    log(`Received input for group: ${containerInput.groupFolder}`);
  } catch (err) {
    writeOutput({
      status: 'error',
      result: null,
      error: `Failed to parse input: ${err instanceof Error ? err.message : String(err)}`,
    });
    process.exit(1);
  }

  const sessionId = containerInput.sessionId || generateSessionId();
  fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });

  // Clean up stale _close sentinel
  try {
    fs.unlinkSync(IPC_INPUT_CLOSE_SENTINEL);
  } catch {
    /* ignore */
  }

  // Build initial prompt
  let prompt = containerInput.prompt;
  if (containerInput.isScheduledTask) {
    prompt = `[SCHEDULED TASK - Automatic execution]\n\n${prompt}`;
  }
  const pending = drainIpcInput();
  if (pending.length > 0) {
    log(`Draining ${pending.length} pending IPC messages into initial prompt`);
    prompt += '\n' + pending.join('\n');
  }

  // Query loop: run query → wait for IPC message → run new query → repeat
  try {
    while (true) {
      log(`Starting query (session: ${sessionId})...`);

      const { output, exitCode, workspaceChanges } = await runCopilotQuery(
        prompt,
        containerInput,
      );

      for (const message of workspaceChanges) {
        log(message);
      }

      if (exitCode !== 0) {
        log(`Copilot exited with code ${exitCode}`);
        writeOutput({
          status: 'error',
          result: output || null,
          newSessionId: sessionId,
          error: `Copilot CLI exited with code ${exitCode}`,
        });
        break;
      }

      // Emit result
      writeOutput({
        status: 'success',
        result: output || null,
        newSessionId: sessionId,
      });

      // Check for close sentinel
      if (shouldClose()) {
        log('Close sentinel detected after query, exiting');
        break;
      }

      // Emit session update
      writeOutput({
        status: 'success',
        result: null,
        newSessionId: sessionId,
      });

      log('Query ended, waiting for next IPC message...');

      const nextMessage = await waitForIpcMessage();
      if (nextMessage === null) {
        log('Close sentinel received, exiting');
        break;
      }

      log(`Got new message (${nextMessage.length} chars), starting new query`);
      prompt = nextMessage;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log(`Agent error: ${errorMessage}`);
    writeOutput({
      status: 'error',
      result: null,
      newSessionId: sessionId,
      error: errorMessage,
    });
    process.exit(1);
  }
}

main();
