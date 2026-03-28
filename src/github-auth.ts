import { execSync } from 'child_process';
import fs from 'fs';
import { request as httpsRequest } from 'https';
import path from 'path';

import { DATA_DIR } from './config.js';
import { readEnvFile } from './env.js';

export type GitHubTokenSource = 'settings' | 'env' | 'gh' | 'none';

export interface CopilotAuthStatus {
  ok: boolean;
  state: 'authenticated' | 'missing' | 'invalid' | 'unauthorized' | 'error' | 'checking';
  source: GitHubTokenSource;
  message: string;
  detail?: string;
  checkedAt: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function readSettingsToken(): string {
  try {
    const settingsPath = path.join(DATA_DIR, 'settings.json');
    if (!fs.existsSync(settingsPath)) return '';
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    return String(settings.github_token || '').trim();
  } catch {
    return '';
  }
}

export function resolveGitHubToken(): { token: string; source: GitHubTokenSource } {
  const settingsToken = readSettingsToken();
  if (settingsToken) {
    return { token: settingsToken, source: 'settings' };
  }

  const envToken = String(
    process.env.GITHUB_TOKEN
      || process.env.GH_TOKEN
      || process.env.COPILOT_GITHUB_TOKEN
      || '',
  ).trim();
  if (envToken) {
    return { token: envToken, source: 'env' };
  }

  const fileSecrets = readEnvFile(['GITHUB_TOKEN', 'GH_TOKEN', 'COPILOT_GITHUB_TOKEN']);
  const fileToken = String(
    fileSecrets.GITHUB_TOKEN
      || fileSecrets.GH_TOKEN
      || fileSecrets.COPILOT_GITHUB_TOKEN
      || '',
  ).trim();
  if (fileToken) {
    return { token: fileToken, source: 'env' };
  }

  try {
    const ghToken = execSync('gh auth token 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
    if (ghToken) {
      return { token: ghToken, source: 'gh' };
    }
  } catch {
    /* ignore */
  }

  return { token: '', source: 'none' };
}

export function detectCopilotAuthFailure(text: string): string | null {
  const normalized = text
    .replace(/\u001b\[[0-9;]*m/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  const missingPatterns = [
    /no authentication token found/i,
    /no github token found/i,
    /authentication is not configured/i,
    /please .*auth.*login/i,
    /not logged in/i,
    /login required/i,
  ];
  if (missingPatterns.some((pattern) => pattern.test(normalized))) {
    return 'GitHub Copilot 認証が未設定です。Settings で有効な GitHub Token を設定してください。';
  }

  const invalidPatterns = [
    /bad credentials/i,
    /invalid token/i,
    /token .* expired/i,
    /authentication failed/i,
    /failed to authenticate/i,
    /github .* unauthorized/i,
    /copilot .* unauthorized/i,
    /401[^\n]*(token|auth|credential|unauthorized)/i,
    /(token|credential|auth)[^\n]*invalid/i,
  ];
  if (invalidPatterns.some((pattern) => pattern.test(normalized))) {
    return 'GitHub Copilot 認証に失敗しました。GitHub Token が無効または期限切れです。Settings で更新してください。';
  }

  return null;
}

function requestGithubUser(token: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      'https://api.github.com/user',
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'coreclaw-auth-check',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf-8');
        res.on('data', (chunk) => {
          if (body.length < 4096) {
            body += chunk;
          }
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            body: body.trim(),
          });
        });
      },
    );

    req.setTimeout(3000, () => {
      req.destroy(new Error('GitHub auth check timed out'));
    });
    req.on('error', reject);
    req.end();
  });
}

export async function checkCopilotAuthStatus(): Promise<CopilotAuthStatus> {
  const { token, source } = resolveGitHubToken();
  if (!token) {
    return {
      ok: false,
      state: 'missing',
      source,
      message: 'GitHub Copilot 認証が未設定です。Settings で GitHub Token を設定してください。',
      checkedAt: nowIso(),
    };
  }

  try {
    const { statusCode, body } = await requestGithubUser(token);

    if (statusCode === 200) {
      return {
        ok: true,
        state: 'authenticated',
        source,
        message: 'GitHub Copilot 認証は有効です。',
        checkedAt: nowIso(),
      };
    }

    if (statusCode === 401) {
      return {
        ok: false,
        state: 'invalid',
        source,
        message: 'GitHub Copilot 認証に失敗しました。GitHub Token が無効または期限切れです。',
        detail: body || undefined,
        checkedAt: nowIso(),
      };
    }

    if (statusCode === 403) {
      return {
        ok: false,
        state: 'unauthorized',
        source,
        message: 'GitHub Token は見つかりましたが、GitHub API へのアクセスが拒否されました。',
        detail: body || undefined,
        checkedAt: nowIso(),
      };
    }

    return {
      ok: false,
      state: 'error',
      source,
      message: `GitHub 認証状態を確認できませんでした。HTTP ${statusCode} が返されました。`,
      detail: body || undefined,
      checkedAt: nowIso(),
    };
  } catch (err) {
    return {
      ok: false,
      state: 'error',
      source,
      message: 'GitHub 認証状態の確認に失敗しました。',
      detail: err instanceof Error ? err.message : String(err),
      checkedAt: nowIso(),
    };
  }
}