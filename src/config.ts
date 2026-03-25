import os from 'os';
import path from 'path';

import { readEnvFile } from './env.js';

const envConfig = readEnvFile([
  'ASSISTANT_NAME',
  'CONTAINER_IMAGE',
  'CONTAINER_TIMEOUT',
  'CONTAINER_MAX_OUTPUT_SIZE',
  'CREDENTIAL_PROXY_PORT',
  'IDLE_TIMEOUT',
  'MAX_CONCURRENT_CONTAINERS',
]);

export const ASSISTANT_NAME =
  process.env.ASSISTANT_NAME || envConfig.ASSISTANT_NAME || 'Andy';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || os.homedir();

export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'coreclaw',
  'mount-allowlist.json',
);
export const SENDER_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'coreclaw',
  'sender-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || envConfig.CONTAINER_IMAGE || 'coreclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || envConfig.CONTAINER_TIMEOUT || '3600000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || envConfig.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
);
export const CREDENTIAL_PROXY_PORT = parseInt(
  process.env.CREDENTIAL_PROXY_PORT || envConfig.CREDENTIAL_PROXY_PORT || '3001',
  10,
);
export const IPC_POLL_INTERVAL = 1000;
export const IDLE_TIMEOUT = parseInt(
  process.env.IDLE_TIMEOUT || envConfig.IDLE_TIMEOUT || '3600000',
  10,
);
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || envConfig.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5,
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
