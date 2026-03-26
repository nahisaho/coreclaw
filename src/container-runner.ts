/**
 * Container Runner for CoreClaw
 * Spawns agent execution in Docker containers running GitHub Copilot CLI
 */
import { ChildProcess, exec, execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import {
  CONTAINER_IMAGE,
  CONTAINER_MAX_OUTPUT_SIZE,
  CONTAINER_TIMEOUT,
  CREDENTIAL_PROXY_PORT,
  DATA_DIR,
  GROUPS_DIR,
  IDLE_TIMEOUT,
  TIMEZONE,
} from './config.js';
import { resolveGroupFolderPath, resolveGroupIpcPath } from './group-folder.js';
import { logger } from './logger.js';
import {
  CONTAINER_HOST_GATEWAY,
  CONTAINER_RUNTIME_BIN,
  hostGatewayArgs,
  readonlyMountArgs,
  stopContainer,
} from './container-runtime.js';
import { validateAdditionalMounts } from './mount-security.js';
import { syncSkillsToGroup } from './skills-sync.js';
import { readEnvFile } from './env.js';
import { RegisteredGroup } from './types.js';

// Sentinel markers for robust output parsing (must match agent-runner)
const OUTPUT_START_MARKER = '---CORECLAW_OUTPUT_START---';
const OUTPUT_END_MARKER = '---CORECLAW_OUTPUT_END---';

export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  isScheduledTask?: boolean;
  assistantName?: string;
}

export interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

export interface AvailableGroup {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
}

interface McpServerConfig {
  name: string;
  type: string;
  command: string;
  args?: string;
  env?: string;
}

function normalizeMcpServer(server: McpServerConfig): McpServerConfig {
  if (
    server.name !== 'ToolUniverse'
    || server.type !== 'stdio'
    || server.command !== 'uvx'
    || !server.args
    || !/^tooluniverse-smcp-stdio(?:\s|$)/.test(server.args.trim())
  ) {
    return server;
  }

  const envEntries = new Map<string, string>();
  for (const pair of (server.env || '').split(',').map((part) => part.trim()).filter(Boolean)) {
    const eq = pair.indexOf('=');
    if (eq > 0) {
      envEntries.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }
  if (!envEntries.has('PYTHONIOENCODING')) {
    envEntries.set('PYTHONIOENCODING', 'utf-8');
  }

  return {
    ...server,
    args: 'tooluniverse',
    env: Array.from(envEntries.entries()).map(([key, value]) => `${key}=${value}`).join(','),
  };
}

function dedupeMcpServers(servers: McpServerConfig[]): McpServerConfig[] {
  const seenNames = new Set<string>();
  const deduped: McpServerConfig[] = [];

  for (const server of servers) {
    const normalized = normalizeMcpServer({
      ...server,
      name: server.name.trim(),
      type: server.type.trim(),
      command: server.command.trim(),
      args: server.args?.trim(),
      env: server.env?.trim(),
    });
    const key = normalized.name.toLowerCase();
    if (key) {
      if (seenNames.has(key)) continue;
      seenNames.add(key);
    }
    deduped.push(normalized);
  }

  return deduped;
}

function buildVolumeMounts(
  group: RegisteredGroup,
  isMain: boolean,
  skillFilter?: string,
): VolumeMount[] {
  const mounts: VolumeMount[] = [];
  const projectRoot = process.cwd();
  const groupDir = resolveGroupFolderPath(group.folder);

  if (isMain) {
    // Main gets project root read-only
    mounts.push({
      hostPath: projectRoot,
      containerPath: '/workspace/project',
      readonly: true,
    });

    // Shadow .env so agent cannot read secrets
    const envFile = path.join(projectRoot, '.env');
    if (fs.existsSync(envFile)) {
      mounts.push({
        hostPath: '/dev/null',
        containerPath: '/workspace/project/.env',
        readonly: true,
      });
    }

    mounts.push({
      hostPath: groupDir,
      containerPath: '/workspace/group',
      readonly: false,
    });
  } else {
    mounts.push({
      hostPath: groupDir,
      containerPath: '/workspace/group',
      readonly: false,
    });

    // Global memory directory (read-only for non-main)
    const globalDir = path.join(GROUPS_DIR, 'global');
    if (fs.existsSync(globalDir)) {
      mounts.push({
        hostPath: globalDir,
        containerPath: '/workspace/global',
        readonly: true,
      });
    }
  }

  // Per-group sessions directory (isolated)
  const groupSessionsDir = path.join(
    DATA_DIR,
    'sessions',
    group.folder,
    '.copilot',
  );
  fs.mkdirSync(groupSessionsDir, { recursive: true });
  mounts.push({
    hostPath: groupSessionsDir,
    containerPath: '/home/node/.copilot',
    readonly: false,
  });

  // Sync Agent Skills into per-group .github/skills/ directory
  const groupSkillsDir = path.join(
    DATA_DIR,
    'sessions',
    group.folder,
    '.github',
    'skills',
  );
  // Clear existing skills so stale ones from a different filter don't persist
  if (fs.existsSync(groupSkillsDir)) {
    fs.rmSync(groupSkillsDir, { recursive: true, force: true });
  }
  syncSkillsToGroup(groupSkillsDir, projectRoot, skillFilter);
  mounts.push({
    hostPath: path.join(DATA_DIR, 'sessions', group.folder, '.github'),
    containerPath: '/workspace/group/.github',
    readonly: false,
  });

  // Per-group IPC namespace
  const groupIpcDir = resolveGroupIpcPath(group.folder);
  fs.mkdirSync(path.join(groupIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'input'), { recursive: true });
  mounts.push({
    hostPath: groupIpcDir,
    containerPath: '/workspace/ipc',
    readonly: false,
  });

  // Copy agent-runner source into per-group writable location
  const agentRunnerSrc = path.join(
    projectRoot,
    'container',
    'agent-runner',
    'src',
  );
  const groupAgentRunnerDir = path.join(
    DATA_DIR,
    'sessions',
    group.folder,
    'agent-runner-src',
  );
  if (!fs.existsSync(groupAgentRunnerDir) && fs.existsSync(agentRunnerSrc)) {
    fs.cpSync(agentRunnerSrc, groupAgentRunnerDir, { recursive: true });
  }
  mounts.push({
    hostPath: groupAgentRunnerDir,
    containerPath: '/app/src',
    readonly: false,
  });

  // Additional mounts validated against external allowlist
  if (group.containerConfig?.additionalMounts) {
    const validatedMounts = validateAdditionalMounts(
      group.containerConfig.additionalMounts,
      group.name,
      isMain,
    );
    mounts.push(...validatedMounts);
  }

  return mounts;
}

function buildContainerArgs(
  mounts: VolumeMount[],
  containerName: string,
  mcpFilter?: string[],
): string[] {
  const args: string[] = ['run', '-i', '--rm', '--name', containerName];

  // Pass host timezone
  args.push('-e', `TZ=${TIMEZONE}`);

  // Pass GitHub token for Copilot CLI authentication
  // Try settings.json first, then .env, then process.env, then `gh auth token`
  let githubToken = '';
  let copilotModel = '';
  try {
    const settingsPath = path.join(DATA_DIR, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      githubToken = settings.github_token || '';
      copilotModel = settings.copilot_model || '';
    }
  } catch { /* ignore */ }
  if (!githubToken) {
    const envSecrets = readEnvFile(['GITHUB_TOKEN', 'GH_TOKEN', 'COPILOT_GITHUB_TOKEN']);
    githubToken = envSecrets.GITHUB_TOKEN || envSecrets.GH_TOKEN || envSecrets.COPILOT_GITHUB_TOKEN || '';
  }
  if (!githubToken) {
    try {
      githubToken = execSync('gh auth token 2>/dev/null', { encoding: 'utf-8', timeout: 5000 }).trim();
    } catch { /* gh not available */ }
  }
  if (githubToken) {
    args.push('-e', `GITHUB_TOKEN=${githubToken}`);
  } else {
    logger.warn('No GitHub token found for container agent');
  }
  if (copilotModel) {
    args.push('-e', `COPILOT_MODEL=${copilotModel}`);
  }

  // Pass GitHub MCP tools setting
  try {
    const settingsPath = path.join(DATA_DIR, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      const mcpTools = settings.github_mcp_tools || '';
      if (mcpTools) {
        args.push('-e', `COPILOT_GITHUB_MCP_TOOLS=${mcpTools}`);
      }
      // Pass custom MCP servers config to container
      let mcpList: McpServerConfig[] = [];
      if (settings.mcp_servers) {
        try {
          mcpList = typeof settings.mcp_servers === 'string'
            ? JSON.parse(settings.mcp_servers)
            : settings.mcp_servers;
        } catch { /* ignore parse errors */ }
      }
      const validMcp = dedupeMcpServers(mcpList).filter((s: McpServerConfig) => s.name && s.command);
      // Apply per-chat MCP filter (if set, only include servers in the filter list)
      const filteredMcp = mcpFilter ? validMcp.filter(s => mcpFilter.includes(s.name)) : validMcp;
      if (filteredMcp.length > 0) {
        // Convert to Copilot CLI --additional-mcp-config format
        const mcpConfig: Record<string, Record<string, unknown>> = {};
        for (const s of filteredMcp) {
          if (s.type === 'stdio') {
            const sArgs = s.args ? s.args.split(/\s+/).filter(Boolean) : [];
            const envObj: Record<string, string> = {};
            if (s.env) {
              for (const pair of s.env.split(',').map((p: string) => p.trim()).filter(Boolean)) {
                const eq = pair.indexOf('=');
                if (eq > 0) envObj[pair.slice(0, eq)] = pair.slice(eq + 1);
              }
            }
            mcpConfig[s.name] = { command: s.command, args: sArgs, ...(Object.keys(envObj).length > 0 ? { env: envObj } : {}) };
          } else {
            mcpConfig[s.name] = { url: s.command, type: s.type };
          }
        }
        const mcpJson = JSON.stringify({ mcpServers: mcpConfig });
        args.push('-e', `COPILOT_MCP_CONFIG=${mcpJson}`);
      }
    }
  } catch { /* ignore */ }

  // Route API traffic through credential proxy (fallback)
  args.push(
    '-e',
    `GITHUB_API_URL=http://${CONTAINER_HOST_GATEWAY}:${CREDENTIAL_PROXY_PORT}`,
  );

  // Runtime-specific args for host gateway
  args.push(...hostGatewayArgs());

  // Run as host user for bind-mount compatibility
  const hostUid = process.getuid?.();
  const hostGid = process.getgid?.();
  if (hostUid != null && hostUid !== 0 && hostUid !== 1000) {
    args.push('--user', `${hostUid}:${hostGid}`);
    args.push('-e', 'HOME=/home/node');
  }

  for (const mount of mounts) {
    if (mount.readonly) {
      args.push(...readonlyMountArgs(mount.hostPath, mount.containerPath));
    } else {
      args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
    }
  }

  args.push(CONTAINER_IMAGE);

  return args;
}

export async function runContainerAgent(
  group: RegisteredGroup,
  input: ContainerInput,
  onProcess: (proc: ChildProcess, containerName: string) => void,
  onOutput?: (output: ContainerOutput) => Promise<void>,
  skillFilter?: string,
  mcpFilter?: string[],
): Promise<ContainerOutput> {
  const startTime = Date.now();

  const groupDir = resolveGroupFolderPath(group.folder);
  fs.mkdirSync(groupDir, { recursive: true });

  const mounts = buildVolumeMounts(group, input.isMain, skillFilter);
  const safeName = group.folder.replace(/[^a-zA-Z0-9-]/g, '-');
  const containerName = `coreclaw-${safeName}-${Date.now()}`;
  const containerArgs = buildContainerArgs(mounts, containerName, mcpFilter);

  logger.info(
    {
      group: group.name,
      containerName,
      mountCount: mounts.length,
      isMain: input.isMain,
    },
    'Spawning container agent',
  );

  const logsDir = path.join(groupDir, 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  return new Promise((resolve) => {
    const container = spawn(CONTAINER_RUNTIME_BIN, containerArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    onProcess(container, containerName);

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    container.stdin.write(JSON.stringify(input));
    container.stdin.end();

    // Streaming output: parse OUTPUT_START/END marker pairs
    let parseBuffer = '';
    let newSessionId: string | undefined;
    let outputChain = Promise.resolve();

    container.stdout.on('data', (data) => {
      const chunk = data.toString();

      if (!stdoutTruncated) {
        const remaining = CONTAINER_MAX_OUTPUT_SIZE - stdout.length;
        if (chunk.length > remaining) {
          stdout += chunk.slice(0, remaining);
          stdoutTruncated = true;
        } else {
          stdout += chunk;
        }
      }

      if (onOutput) {
        parseBuffer += chunk;
        let startIdx: number;
        while ((startIdx = parseBuffer.indexOf(OUTPUT_START_MARKER)) !== -1) {
          const endIdx = parseBuffer.indexOf(OUTPUT_END_MARKER, startIdx);
          if (endIdx === -1) break;

          const jsonStr = parseBuffer
            .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
            .trim();
          parseBuffer = parseBuffer.slice(endIdx + OUTPUT_END_MARKER.length);

          try {
            const parsed: ContainerOutput = JSON.parse(jsonStr);
            if (parsed.newSessionId) {
              newSessionId = parsed.newSessionId;
            }
            hadStreamingOutput = true;
            resetTimeout();
            outputChain = outputChain.then(() => onOutput(parsed));
          } catch (err) {
            logger.warn(
              { group: group.name, error: err },
              'Failed to parse streamed output chunk',
            );
          }
        }
      }
    });

    container.stderr.on('data', (data) => {
      const chunk = data.toString();
      const lines = chunk.trim().split('\n');
      for (const line of lines) {
        if (line) logger.debug({ container: group.folder }, line);
      }
      if (stderrTruncated) return;
      const remaining = CONTAINER_MAX_OUTPUT_SIZE - stderr.length;
      if (chunk.length > remaining) {
        stderr += chunk.slice(0, remaining);
        stderrTruncated = true;
      } else {
        stderr += chunk;
      }
    });

    let timedOut = false;
    let hadStreamingOutput = false;
    const configTimeout = group.containerConfig?.timeout || CONTAINER_TIMEOUT;
    const timeoutMs = Math.max(configTimeout, IDLE_TIMEOUT + 30_000);

    const killOnTimeout = () => {
      timedOut = true;
      logger.error(
        { group: group.name, containerName },
        'Container timeout, stopping gracefully',
      );
      exec(stopContainer(containerName), { timeout: 15000 }, (err) => {
        if (err) {
          logger.warn(
            { group: group.name, containerName, err },
            'Graceful stop failed, force killing',
          );
          container.kill('SIGKILL');
        }
      });
    };

    let timeout = setTimeout(killOnTimeout, timeoutMs);

    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(killOnTimeout, timeoutMs);
    };

    container.on('close', (code) => {
      clearTimeout(timeout);
      const duration = Date.now() - startTime;

      if (timedOut) {
        if (hadStreamingOutput) {
          logger.info(
            { group: group.name, containerName, duration, code },
            'Container timed out after output (idle cleanup)',
          );
          outputChain.then(() => {
            resolve({ status: 'success', result: null, newSessionId });
          });
          return;
        }

        resolve({
          status: 'error',
          result: null,
          error: `Container timed out after ${configTimeout}ms`,
        });
        return;
      }

      // Log container run
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = path.join(logsDir, `container-${timestamp}.log`);
      fs.writeFileSync(
        logFile,
        [
          `=== Container Run Log ===`,
          `Timestamp: ${new Date().toISOString()}`,
          `Group: ${group.name}`,
          `Duration: ${duration}ms`,
          `Exit Code: ${code}`,
          ``,
          `=== STDERR ===`,
          stderr.slice(0, 50000),
        ].join('\n'),
      );

      if (hadStreamingOutput) {
        outputChain.then(() => {
          resolve({ status: 'success', result: null, newSessionId });
        });
        return;
      }

      if (code !== 0) {
        resolve({
          status: 'error',
          result: null,
          error: `Container exited with code ${code}`,
        });
        return;
      }

      // Parse final output from stdout
      const startMarkerIdx = stdout.lastIndexOf(OUTPUT_START_MARKER);
      const endMarkerIdx = stdout.lastIndexOf(OUTPUT_END_MARKER);
      if (startMarkerIdx !== -1 && endMarkerIdx > startMarkerIdx) {
        const jsonStr = stdout
          .slice(startMarkerIdx + OUTPUT_START_MARKER.length, endMarkerIdx)
          .trim();
        try {
          resolve(JSON.parse(jsonStr));
          return;
        } catch {
          /* fall through */
        }
      }

      resolve({
        status: 'success',
        result: stdout.trim() || null,
        newSessionId,
      });
    });
  });
}

// --- Snapshot helpers for container-readable state ---

interface TaskSnapshot {
  id: string;
  groupFolder: string;
  prompt: string;
  schedule_type: string;
  schedule_value: string;
  status: string;
  next_run: string | null;
}

export function writeTasksSnapshot(
  groupFolder: string,
  isMain: boolean,
  tasks: TaskSnapshot[],
): void {
  const ipcDir = path.join(DATA_DIR, 'ipc', groupFolder, 'tasks');
  fs.mkdirSync(ipcDir, { recursive: true });

  const visibleTasks = isMain
    ? tasks
    : tasks.filter((t) => t.groupFolder === groupFolder);

  fs.writeFileSync(
    path.join(ipcDir, 'snapshot.json'),
    JSON.stringify(visibleTasks, null, 2),
  );
}

export function writeGroupsSnapshot(
  groupFolder: string,
  isMain: boolean,
  availableGroups: AvailableGroup[],
  registeredJids: Set<string>,
): void {
  if (!isMain) return;

  const ipcDir = path.join(DATA_DIR, 'ipc', groupFolder, 'messages');
  fs.mkdirSync(ipcDir, { recursive: true });

  fs.writeFileSync(
    path.join(ipcDir, 'groups-snapshot.json'),
    JSON.stringify(availableGroups, null, 2),
  );
}
