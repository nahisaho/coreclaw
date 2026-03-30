import fs from 'fs';
import path from 'path';

import { test, expect } from '@playwright/test';

function listZipEntryNames(zipBuffer: Buffer): string[] {
  const names: string[] = [];
  let offset = 0;

  while (offset < zipBuffer.length - 4) {
    const signature = zipBuffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) break;

    const compressedSize = zipBuffer.readUInt32LE(offset + 18);
    const nameLength = zipBuffer.readUInt16LE(offset + 26);
    const extraLength = zipBuffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = zipBuffer.subarray(nameStart, nameStart + nameLength).toString('utf-8');
    const dataStart = nameStart + nameLength + extraLength;

    names.push(name);
    offset = dataStart + compressedSize;
  }

  return names;
}

function buildZipBuffer(entries: Array<{ name: string; data: string | Buffer }>): Buffer {
  const parts: Buffer[] = [];
  const centralDir: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf-8');
    const nameBytes = Buffer.from(entry.name, 'utf-8');
    const crc = crc32(data);

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    nameBytes.copy(local, 30);

    parts.push(local, data);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);

    centralDir.push(central);
    offset += local.length + data.length;
  }

  const centralDirBuf = Buffer.concat(centralDir);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

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

// ============================================================
// 1. Page Load & Basic UI
// ============================================================

test.describe('Page Load', () => {
  test('loads the CoreClaw UI', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/CoreClaw/);
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('.welcome h2')).toHaveText('🐾 CoreClaw');
  });

  test('does not show skill entry in sidebar', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.sidebar-nav .sidebar-nav-item')).toHaveCount(2);
    await expect(page.locator('#skillCount')).toHaveCount(0);
    await expect(page.locator('#activeSkillBadge')).toHaveCount(0);
  });
});

// ============================================================
// 2. Sidebar Toggle
// ============================================================

test.describe('Sidebar Toggle', () => {
  test('toggle button closes and opens sidebar', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('.sidebar');
    const toggle = page.locator('#sidebarToggle');

    await expect(sidebar).not.toHaveClass(/collapsed/);

    // Close
    await toggle.click();
    await expect(sidebar).toHaveClass(/collapsed/);

    // Open (use .main-toggle which appears when sidebar is collapsed)
    await page.locator('.main-toggle').click();
    await expect(sidebar).not.toHaveClass(/collapsed/);
  });

  test('Ctrl+B toggles sidebar', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('.sidebar');

    await page.keyboard.press('Control+b');
    await expect(sidebar).toHaveClass(/collapsed/);

    await page.keyboard.press('Control+b');
    await expect(sidebar).not.toHaveClass(/collapsed/);
  });
});

// ============================================================
// 3. Experiment CRUD
// ============================================================

test.describe('Experiment Management', () => {
  test('create a new experiment via modal', async ({ page }) => {
    await page.goto('/');

    // Click + New
    await page.click('button:has-text("New Chat")');
    await expect(page.locator('#newExpModal')).toHaveClass(/visible/);

    // Fill form
    await page.fill('#expNameInput', 'Playwright Test Experiment');
    await page.fill('#expDescInput', 'Automated test experiment');
    await page.click('#newExpModal .btn-primary');

    // Modal closes, experiment appears in sidebar
    await expect(page.locator('#newExpModal')).not.toHaveClass(/visible/);
    await expect(page.locator('.experiment-item.active .exp-name')).toHaveText('Playwright Test Experiment');

    // Chat area is visible
    await expect(page.locator('#expTitle')).toHaveText('Playwright Test Experiment');
    await expect(page.locator('#messagesArea')).toHaveClass(/visible/);
    await expect(page.locator('#inputArea')).toHaveClass(/visible/);
  });

  test('Alt+N opens new experiment modal', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Alt+n');
    await expect(page.locator('#newExpModal')).toHaveClass(/visible/);
    // Escape closes
    await page.keyboard.press('Escape');
    await expect(page.locator('#newExpModal')).not.toHaveClass(/visible/);
  });

  test('rename experiment via header click', async ({ page }) => {
    await page.goto('/');

    // Create experiment first
    await page.click('button:has-text("New Chat")');
    await page.fill('#expNameInput', 'To Be Renamed');
    await page.click('#newExpModal .btn-primary');
    await expect(page.locator('#expTitle')).toHaveText('To Be Renamed');

    // Click title to rename
    await page.click('#expTitle');
    await expect(page.locator('#renameExpModal')).toHaveClass(/visible/);
    await expect(page.locator('#renameInput')).toHaveValue('To Be Renamed');

    // Change name
    await page.fill('#renameInput', 'Renamed Experiment');
    await page.click('#renameExpModal .btn-primary');

    await expect(page.locator('#renameExpModal')).not.toHaveClass(/visible/);
    await expect(page.locator('#expTitle')).toHaveText('Renamed Experiment');
  });

  test('delete experiment requires name confirmation', async ({ page }) => {
    await page.goto('/');

    // Create experiment
    await page.click('button:has-text("New Chat")');
    await page.fill('#expNameInput', 'Delete Me');
    await page.click('#newExpModal .btn-primary');

    // Click delete
    await page.click('.header-btn.danger');
    await expect(page.locator('#deleteExpModal')).toHaveClass(/visible/);
    await expect(page.locator('#deleteExpName')).toHaveText('Delete Me');

    // Delete button should be disabled
    await expect(page.locator('#deleteConfirmBtn')).toBeDisabled();

    // Type wrong name — still disabled
    await page.fill('#deleteConfirmInput', 'Wrong Name');
    await expect(page.locator('#deleteConfirmBtn')).toBeDisabled();

    // Type correct name — enabled
    await page.fill('#deleteConfirmInput', 'Delete Me');
    await expect(page.locator('#deleteConfirmBtn')).toBeEnabled();

    // Confirm delete
    await page.click('#deleteConfirmBtn');
    await expect(page.locator('#deleteExpModal')).not.toHaveClass(/visible/);

    // Back to welcome screen
    await expect(page.locator('.welcome')).toBeVisible();
    // Deleted experiment gone from sidebar
    await expect(page.locator('.experiment-item:has-text("Delete Me")')).toHaveCount(0);
  });

  test('sidebar rename and delete buttons appear on hover', async ({ page }) => {
    await page.goto('/');

    // Create experiment
    await page.click('button:has-text("New Chat")');
    await page.fill('#expNameInput', 'Hover Test');
    await page.click('#newExpModal .btn-primary');

    // Hover to show action buttons
    const item = page.locator('.experiment-item').first();
    await item.hover();
    await expect(item.locator('.exp-actions')).toBeVisible();
  });

  test('artifacts modal renders folders as a tree', async ({ page }) => {
    await page.route('**/api/experiments/*/artifacts/tree', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { path: 'data', type: 'directory' },
          { path: 'data/empty', type: 'directory' },
          { path: 'figures', type: 'directory' },
          { path: 'figures/plot.png', type: 'file' },
          { path: 'logs', type: 'directory' },
          { path: 'logs/process-log.jsonl', type: 'file' },
          { path: 'report.md', type: 'file' },
        ]),
      });
    });

    await page.goto('/');
    await page.click('button:has-text("New Chat")');
    await page.fill('#expNameInput', 'Artifacts Tree');
    await page.click('#newExpModal .btn-primary');

    await page.click('button:has-text("Artifacts")');

    await expect(page.locator('#artifactsModal')).toHaveClass(/visible/);
    await expect(page.locator('.artifact-tree-row.directory')).toHaveCount(4);
    await expect(page.locator('.artifact-tree-row.file')).toHaveCount(3);
    await expect(page.locator('.artifact-tree-row.directory[data-path="data"]')).toHaveAttribute('data-collapsed', 'false');
    await expect(page.locator('.artifact-tree-row.directory[data-path="data/empty"] .artifact-name')).toHaveText('empty');
    await expect(page.locator('.artifact-tree-row.file[data-path="logs/process-log.jsonl"] .artifact-name')).toHaveText('process-log.jsonl');
    await expect(page.locator('#artifactsActions .btn-primary')).toContainText('Download All');

    await page.locator('.artifact-tree-row.directory[data-path="data"]').click();
    await expect(page.locator('.artifact-tree-row.directory[data-path="data"]')).toHaveAttribute('data-collapsed', 'true');
    await expect(page.locator('.artifact-tree-row.directory[data-path="data/empty"]')).toHaveCount(0);

    await page.locator('.artifact-tree-row.directory[data-path="data"]').click();
    await expect(page.locator('.artifact-tree-row.directory[data-path="data"]')).toHaveAttribute('data-collapsed', 'false');
    await expect(page.locator('.artifact-tree-row.directory[data-path="data/empty"] .artifact-name')).toHaveText('empty');
  });

  test('artifacts view and download support Japanese filenames', async ({ page }) => {
    await page.addInitScript(() => {
      const originalClick = HTMLAnchorElement.prototype.click;
      window.__lastDownload = null;
      HTMLAnchorElement.prototype.click = function patchedClick() {
        if (this.download) {
          window.__lastDownload = {
            href: this.href,
            download: this.download,
          };
          return;
        }
        return originalClick.call(this);
      };
    });

    await page.route('**/api/experiments/*/artifacts/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/markdown; charset=utf-8',
        body: '# 結果\n\n日本語ファイル名の表示確認',
      });
    });

    await page.goto('/');

    await page.evaluate(() => {
      currentExpId = 'jp-artifact-test';
      currentArtifactEntries = [{ path: '結果レポート.md', type: 'file' }];
      renderArtifactsTree();
      document.getElementById('artifactsModal').classList.add('visible');
    });

    await expect(page.locator('#artifactsModal')).toHaveClass(/visible/);

    const row = page.locator('.artifact-tree-row.file').filter({ hasText: '結果レポート.md' });
    await expect(row.locator('.artifact-name')).toHaveText('結果レポート.md');

    await row.locator('.artifact-btn.dl-btn').click();
    await expect.poll(() => page.evaluate(() => window.__lastDownload)).toEqual(expect.objectContaining({
      download: '結果レポート.md',
    }));
    await expect.poll(() => page.evaluate(() => window.__lastDownload.href)).toContain('%E7%B5%90%E6%9E%9C%E3%83%AC%E3%83%9D%E3%83%BC%E3%83%88.md');
    await expect.poll(() => page.evaluate(() => window.__lastDownload.href)).toContain('download=1');

    await row.locator('.artifact-btn.view-btn').click();
    const viewerModal = page.locator('#artifactViewerModal.visible');
    await expect(viewerModal).toHaveCount(1);
    await expect(viewerModal.locator('#avFilename')).toHaveText('結果レポート.md');
    await expect(viewerModal.locator('#avBody')).toContainText('日本語ファイル名の表示確認');
  });
});

// ============================================================
// 4. Settings Modal
// ============================================================

test.describe('Settings', () => {
  async function clearMcpServers(page) {
    while (await page.locator('.mcp-server-card').count() > 0) {
      await page.locator('.mcp-server-card').first().locator('.mcp-remove').click();
    }
  }

  test('open and close settings modal', async ({ page }) => {
    await page.goto('/');

    await page.click('.settings-btn');
    await expect(page.locator('#settingsModal')).toHaveClass(/visible/);

    // Close with X button
    await page.click('#settingsModal .modal-close');
    await expect(page.locator('#settingsModal')).not.toHaveClass(/visible/);
  });

  test('stop button requests web server shutdown', async ({ page }) => {
    let shutdownRequested = false;

    await page.route('**/api/shutdown', async (route) => {
      shutdownRequested = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'Shutting down CoreClaw' }),
      });
    });

    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.accept();
    });

    await page.goto('/');
    await page.locator('#stopServerBtn').click();

    await expect(page.locator('#stopServerBtn')).toHaveText('✅');
    expect(shutdownRequested).toBe(true);
  });

  test('stop button does not request shutdown when cancelled', async ({ page }) => {
    let shutdownRequested = false;

    await page.route('**/api/shutdown', async (route) => {
      shutdownRequested = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'Shutting down CoreClaw' }),
      });
    });

    page.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('confirm');
      await dialog.dismiss();
    });

    await page.goto('/');
    await page.locator('#stopServerBtn').click();

    await expect(page.locator('#stopServerBtn')).toHaveText('🔴');
    expect(shutdownRequested).toBe(false);
  });

  test('provider toggle switches between OpenAI / Azure / Ollama', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');

    // Switch to STT Provider tab
    await page.click('#settingsTabButtonStt');

    // Select OpenAI
    await page.selectOption('#sttProviderSelect', 'openai');
    await expect(page.locator('#openaiFields')).toBeVisible();
    await expect(page.locator('#azureFields')).not.toBeVisible();
    await expect(page.locator('#ollamaFields')).not.toBeVisible();

    // Switch to Azure
    await page.selectOption('#sttProviderSelect', 'azure');
    await expect(page.locator('#openaiFields')).not.toBeVisible();
    await expect(page.locator('#azureFields')).toBeVisible();
    await expect(page.locator('#ollamaFields')).not.toBeVisible();

    // Switch to Ollama
    await page.selectOption('#sttProviderSelect', 'ollama');
    await expect(page.locator('#openaiFields')).not.toBeVisible();
    await expect(page.locator('#azureFields')).not.toBeVisible();
    await expect(page.locator('#ollamaFields')).toBeVisible();
    await expect(page.locator('#settingsOllamaUrl')).toHaveValue('http://localhost:11434');
  });

  test('save settings and reload persists values', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');

    await page.selectOption('#settingsOutputLanguage', 'en');

    // Switch to GitHub tab
    await page.click('#settingsTabButtonGithub');
    await page.fill('#settingsGithubUser', 'test-user');
    await page.click('#settingsSaveButton');

    // Save closes the modal
    await expect(page.locator('#settingsModal')).not.toHaveClass(/visible/);

    // Reopen settings — values should persist
    await page.click('.settings-btn');
    await expect(page.locator('#settingsOutputLanguage')).toHaveValue('en');
    await expect(page.locator('#settingsGithubUser')).toHaveValue('test-user');
  });

  test('General settings labels switch between Japanese and English', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');

    await page.selectOption('#settingsOutputLanguage', 'ja');
    await page.click('#settingsSaveButton');

    await page.click('.settings-btn');

    await expect(page.locator('#settingsTabButtonGeneral')).toHaveText('一般');
    await expect(page.locator('#settingsOutputLanguageHeading')).toHaveText('🗣 出力言語');
    await expect(page.locator('#settingsOutputLanguageLabel')).toContainText('言語');
    await expect(page.locator('#settingsOutputLanguageHint')).toHaveText('エージェントの最終応答に使う言語を選択します。');

    await page.selectOption('#settingsOutputLanguage', 'en');
    await page.click('#settingsSaveButton');

    await page.click('.settings-btn');
    await expect(page.locator('#settingsTabButtonGeneral')).toHaveText('General');
    await expect(page.locator('#settingsOutputLanguageHeading')).toHaveText('🗣 Output Language');
    await expect(page.locator('#settingsOutputLanguageLabel')).toContainText('Language');
    await expect(page.locator('#settingsOutputLanguageHint')).toHaveText('Choose the output language for the agent\'s final response.');
  });

  test('shows Copilot auth precheck status in sidebar and settings', async ({ page }) => {
    await page.route('**/api/auth/copilot-status**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          state: 'invalid',
          source: 'settings',
          message: 'GitHub Copilot 認証に失敗しました。GitHub Token が無効または期限切れです。',
          checkedAt: new Date('2025-01-01T00:00:00Z').toISOString(),
        }),
      });
    });

    await page.goto('/');

    await expect(page.locator('#sidebarAuthStatus')).toContainText(/Copilot Auth: (Invalid|無効)/);
    await expect(page.locator('#sidebarAuthStatus')).toContainText('GitHub Token が無効または期限切れです。');

    await page.click('.settings-btn');
    await page.click('#settingsTabButtonAuth');

    await expect(page.locator('#settingsCopilotAuthStatus')).toContainText(/(無効|Invalid)/);
    await expect(page.locator('#settingsCopilotAuthStatus')).toContainText('GitHub Token が無効または期限切れです。');
    await expect(page.locator('#settingsCopilotAuthStatus')).toContainText(/(取得元|Source): Settings/);
  });

  test('add MCP server manually', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');

    // Switch to MCP Servers tab
    await page.click('#settingsTabButtonMcp');
    await clearMcpServers(page);
    await page.click('.btn-add-mcp');
    // MCP server card should appear
    await expect(page.locator('.mcp-server-card')).toHaveCount(1);
  });

  test('add multiple MCP servers and remove one', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonMcp');
    await clearMcpServers(page);

    // Add two servers
    await page.click('.btn-add-mcp');
    await page.click('.btn-add-mcp');
    await expect(page.locator('.mcp-server-card')).toHaveCount(2);

    // Remove the first one
    await page.locator('.mcp-server-card').first().locator('.mcp-remove').click();
    await expect(page.locator('.mcp-server-card')).toHaveCount(1);
  });

  test('add ToolUniverse preset', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonMcp');
    await clearMcpServers(page);

    await page.click('#settingsAddToolUniverseButton');
    await expect(page.locator('.mcp-server-card')).toHaveCount(1);

    // Verify preset values
    const card = page.locator('.mcp-server-card').first();
    await expect(card.locator('input.mcp-name')).toHaveValue('ToolUniverse');
    await expect(card.locator('input[placeholder*="Command"]')).toHaveValue('uvx');
    await expect(card.locator('input[placeholder*="Args"]')).toHaveValue('tooluniverse');
    await expect(card.locator('input[placeholder*="KEY=VAL"]')).toHaveValue('PYTHONIOENCODING=utf-8');
  });

  test('does not duplicate ToolUniverse preset', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonMcp');
    await clearMcpServers(page);

    await page.click('#settingsAddToolUniverseButton');
    await page.click('#settingsAddToolUniverseButton');

    await expect(page.locator('.mcp-server-card')).toHaveCount(1);
    await expect(page.locator('.mcp-server-card input.mcp-name')).toHaveValue('ToolUniverse');
  });

  test('add Deep Research preset', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonMcp');
    await clearMcpServers(page);

    await page.click('#settingsAddDeepResearchButton');
    await expect(page.locator('.mcp-server-card')).toHaveCount(1);

    // Verify preset values
    const card = page.locator('.mcp-server-card').first();
    await expect(card.locator('input.mcp-name')).toHaveValue('deep-research');
    await expect(card.locator('input[placeholder*="Command"]')).toHaveValue('uvx');
    await expect(card.locator('input[placeholder*="Args"]')).toHaveValue('mcp-server-deep-research');
  });

  test('MCP server card has type selector with stdio/SSE/Streamable HTTP', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonMcp');
    await clearMcpServers(page);

    await page.click('.btn-add-mcp');
    const card = page.locator('.mcp-server-card').first();

    // Type select should default to stdio
    const typeSelect = card.locator('select');
    await expect(typeSelect).toHaveValue('stdio');

    // Should have all three options
    const options = typeSelect.locator('option');
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toHaveText('stdio');
    await expect(options.nth(1)).toHaveText('SSE');
    await expect(options.nth(2)).toHaveText('Streamable HTTP');
  });

  test('loads marketplace skills in Skills tab', async ({ page }) => {
    await page.route('**/api/skills/marketplace', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            slug: 'scientist',
            name: 'Scientist',
            description: 'Research pack',
            icon: '🔬',
            version: 'v1.2.3',
            count: 196,
            installed: false,
          },
        ]),
      });
    });

    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonSkills');

    const marketplace = page.locator('#marketplaceSkillList');
    await expect(marketplace.locator('.skill-card')).toHaveCount(1);
    await expect(marketplace).toContainText('Scientist');
    await expect(marketplace).toContainText('Research pack');
    await expect(marketplace).toContainText('Version v1.2.3');
    await expect(marketplace).toContainText('196 skills');
    await expect(marketplace.locator('button:has-text("Import")')).toBeVisible();
  });

  test('shows marketplace description popup from info button', async ({ page }) => {
    await page.route('**/api/skills/marketplace', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            slug: 'educationalist',
            name: 'Educationalist',
            description: 'Skills for educators and curriculum design.',
            icon: '📚',
            version: 'v0.9.0',
            count: 1,
            installed: true,
          },
        ]),
      });
    });

    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonSkills');
    await page.locator('#marketplaceSkillList .marketplace-info-btn').click();

    await expect(page.locator('#marketplaceInfoModal')).toHaveClass(/visible/);
    await expect(page.locator('#marketplaceInfoTitle')).toContainText('Educationalist');
    await expect(page.locator('#marketplaceInfoVersion')).toContainText('Version v0.9.0');
    await expect(page.locator('#marketplaceInfoBody')).toContainText('Skills for educators and curriculum design.');
    await expect(page.locator('#marketplaceInfoInstalled')).toBeVisible();
  });

  test('filters marketplace skills by search text', async ({ page }) => {
    await page.route('**/api/skills/marketplace', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            slug: 'scientist',
            name: 'Scientist',
            description: 'Research workflows and analysis.',
            icon: '🔬',
            version: 'v1.2.3',
            count: 196,
            installed: false,
          },
          {
            slug: 'educationalist',
            name: 'Educationalist',
            description: 'Skills for educators and curriculum design.',
            icon: '📚',
            version: 'v0.9.0',
            count: 1,
            installed: false,
          },
        ]),
      });
    });

    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonSkills');

    const marketplace = page.locator('#marketplaceSkillList');
    await expect(marketplace.locator('.skill-card')).toHaveCount(2);

    await page.fill('#marketplaceSearchInput', 'curriculum');

    await expect(marketplace.locator('.skill-card')).toHaveCount(1);
    await expect(marketplace).toContainText('Educationalist');
    await expect(marketplace).not.toContainText('Scientist');

    await page.fill('#marketplaceSearchInput', 'no-match');

    await expect(marketplace.locator('.skill-card')).toHaveCount(0);
    await expect(page.locator('#marketplaceSkillEmpty')).toContainText('No marketplace skills match "no-match".');
  });

  test('reopens Skills tab with fresh marketplace data', async ({ page }) => {
    let marketplaceCalls = 0;
    await page.route('**/api/skills/marketplace', async (route) => {
      marketplaceCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            slug: 'general-assistant',
            name: 'General Assistant',
            description: marketplaceCalls === 1 ? 'First state' : 'Refreshed state',
            icon: '🤖',
            version: marketplaceCalls === 1 ? 'v0.1.0' : 'v0.2.0',
            count: 1,
            installed: marketplaceCalls === 1,
          },
        ]),
      });
    });

    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonSkills');

    const marketplace = page.locator('#marketplaceSkillList');
    await expect(marketplace).toContainText('First state');
    await expect(marketplace).toContainText('Version v0.1.0');
    await expect(marketplace).toContainText('Installed');

    await page.click('#settingsTabButtonUpdates');
    await page.click('#settingsTabButtonSkills');

    await expect(marketplace).toContainText('Refreshed state');
    await expect(marketplace).toContainText('Version v0.2.0');
    await expect(marketplace.locator('.marketplace-installed')).toHaveCount(0);
  });

  test('shows skill version in Skills tab', async ({ page }) => {
    await page.route('**/api/skills', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            name: 'scientist',
            description: 'Research pack',
            version: '1.2.3',
            fileCount: 196,
          },
        ]),
      });
    });

    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonSkills');

    const skills = page.locator('#skillList');
    await expect(skills).toContainText('scientist');
    await expect(skills).toContainText('Version 1.2.3');
  });

  test('shows marketplace update controls for imported skills', async ({ page }) => {
    await page.route('**/api/skills', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            name: 'scientist',
            description: 'Research pack',
            version: 'v1.2.3',
            fileCount: 196,
            marketplaceImported: true,
            marketplaceSlug: 'scientist',
            latestVersion: 'v1.2.4',
            updateAvailable: true,
          },
        ]),
      });
    });
    await page.route('**/api/skills/marketplace', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonSkills');

    const skills = page.locator('#skillList');
    await expect(skills).toContainText('Version v1.2.3');
    await expect(skills).toContainText('Update available: v1.2.4');
    await expect(skills.locator('button:has-text("Check")')).toBeVisible();
    await expect(page.locator('#skillList').getByRole('button', { name: 'Update', exact: true })).toBeEnabled();
  });

  test('keeps Update disabled when no marketplace update is available', async ({ page }) => {
    await page.route('**/api/skills', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            name: 'scientist',
            description: 'Research pack',
            version: 'v1.2.4',
            fileCount: 196,
            marketplaceImported: true,
            marketplaceSlug: 'scientist',
            latestVersion: 'v1.2.4',
            updateAvailable: false,
          },
        ]),
      });
    });
    await page.route('**/api/skills/marketplace', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonSkills');

    const updateButton = page.locator('#skillList').getByRole('button', { name: 'Update', exact: true });
    await expect(updateButton).toBeDisabled();
  });

  test('keeps marketplace import Update disabled when no update is available', async ({ page }) => {
    await page.route('**/api/skills', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.route('**/api/skills/marketplace', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            slug: 'scientist',
            name: 'Scientist',
            description: 'Research pack',
            icon: '🔬',
            version: 'v1.2.4',
            count: 196,
            installed: true,
            updateAvailable: false,
          },
        ]),
      });
    });

    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonSkills');

    const updateButton = page.locator('#marketplaceSkillList').getByRole('button', { name: 'Update', exact: true });
    await expect(updateButton).toBeDisabled();
  });

  test('checks marketplace update status for imported skills', async ({ page }) => {
    let skillCalls = 0;
    await page.route('**/api/skills', async (route) => {
      skillCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            name: 'scientist',
            description: 'Research pack',
            version: 'v1.2.3',
            fileCount: 196,
            marketplaceImported: true,
            marketplaceSlug: 'scientist',
            latestVersion: skillCalls === 1 ? '' : 'v1.2.4',
            updateAvailable: skillCalls > 1,
          },
        ]),
      });
    });
    await page.route('**/api/skills/marketplace', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            slug: 'scientist',
            name: 'Scientist',
            description: 'Research pack',
            icon: '🔬',
            version: 'v1.2.4',
            count: 196,
            installed: true,
          },
        ]),
      });
    });
    await page.route('**/api/skills/scientist/marketplace-status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          name: 'scientist',
          marketplaceImported: true,
          marketplaceSlug: 'scientist',
          currentVersion: 'v1.2.3',
          latestVersion: 'v1.2.4',
          updateAvailable: true,
        }),
      });
    });

    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonSkills');
    await page.locator('#skillList button:has-text("Check")').click();

    const skills = page.locator('#skillList');
    await expect(skills).toContainText('Update available: v1.2.4');
    await expect(page.locator('#skillList').getByRole('button', { name: 'Update', exact: true })).toBeEnabled();
  });

  test('refresh marketplace updates imported skill marketplace version state', async ({ page }) => {
    let skillCalls = 0;
    let marketplaceCalls = 0;

    await page.route('**/api/skills', async (route) => {
      skillCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            name: 'scientist',
            description: 'Research pack',
            version: 'v1.2.3',
            fileCount: 196,
            marketplaceImported: true,
            marketplaceSlug: 'scientist',
            latestVersion: skillCalls <= 2 ? 'v1.2.3' : 'v1.2.4',
            updateAvailable: skillCalls > 2,
          },
        ]),
      });
    });

    await page.route('**/api/skills/marketplace', async (route) => {
      marketplaceCalls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            slug: 'scientist',
            name: 'Scientist',
            description: 'Research pack',
            icon: '🔬',
            version: marketplaceCalls === 1 ? 'v1.2.3' : 'v1.2.4',
            count: 196,
            installed: true,
          },
        ]),
      });
    });

    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonSkills');

    const skills = page.locator('#skillList');
    await expect(skills).toContainText('Marketplace v1.2.3');
    await expect(page.locator('#skillList').getByRole('button', { name: 'Update', exact: true })).toBeDisabled();

    await page.click('#settingsRefreshMarketplaceButton');

    await expect(skills).toContainText('Update available: v1.2.4');
    await expect(page.locator('#skillList').getByRole('button', { name: 'Update', exact: true })).toBeEnabled();
  });

  test('coreclaw update failure does not show a blocking popup', async ({ page }) => {
    let dialogSeen = false;

    await page.route('**/api/versions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          coreclaw: { version: '0.1.40', description: 'CoreClaw' },
          copilot: { version: '1.0.0', description: 'GitHub Copilot CLI' },
        }),
      });
    });
    await page.route('**/api/check/coreclaw', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          available: true,
          current: '0.1.40',
          latest: '0.1.41',
          message: 'v0.1.41 available',
        }),
      });
    });
    await page.route('**/api/update/coreclaw', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          message: 'Update failed',
        }),
      });
    });

    page.on('dialog', async (dialog) => {
      dialogSeen = true;
      await dialog.dismiss();
    });

    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonUpdates');
    await page.locator('#check-coreclaw').click();
    await expect(page.locator('#update-coreclaw')).toBeEnabled();
    await page.locator('#update-coreclaw').click();
    await page.waitForTimeout(200);

    expect(dialogSeen).toBe(false);
  });

  test('MCP servers persist via settings save/reload', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonMcp');
    await clearMcpServers(page);

    // Add a ToolUniverse preset
    await page.click('#settingsAddToolUniverseButton');
    await expect(page.locator('.mcp-server-card')).toHaveCount(1);

    // Save settings
    await page.click('#settingsSaveButton');
    await expect(page.locator('#settingsModal')).not.toHaveClass(/visible/);

    // Reopen settings
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonMcp');

    // Server should still be there
    await expect(page.locator('.mcp-server-card')).toHaveCount(1);
    await expect(page.locator('.mcp-server-card input.mcp-name')).toHaveValue('ToolUniverse');
  });

  test('MCP servers stored in settings API', async ({ request }) => {
    // Save MCP servers via API
    const mcpServers = JSON.stringify([
      { name: 'test-mcp', type: 'stdio', command: 'npx', args: '-y test-server', env: '' },
      { name: 'test-mcp', type: 'stdio', command: 'npx', args: '-y test-server', env: '' },
    ]);
    const putRes = await request.put('/api/settings', {
      data: { mcp_servers: mcpServers },
    });
    expect(putRes.ok()).toBeTruthy();

    // Retrieve and verify
    const getRes = await request.get('/api/settings');
    const settings = await getRes.json();
    const parsed = JSON.parse(settings.mcp_servers);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('test-mcp');
    expect(parsed[0].command).toBe('npx');
  });

  test('per-chat MCP selection in new chat modal', async ({ page }) => {
    // First, save MCP servers so checkboxes appear
    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonMcp');

    // Remove any existing servers first
    await clearMcpServers(page);

    await page.click('#settingsAddToolUniverseButton');
    await page.click('#settingsAddDeepResearchButton');
    await page.click('#settingsSaveButton');

    // Open new chat modal
    await page.click('button:has-text("New Chat")');
    await expect(page.locator('#newExpModal')).toHaveClass(/visible/);

    // MCP checkboxes should show in new chat modal
    const checkboxes = page.locator('#expMcpCheckboxes input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(2);

    // Default: all checked
    await expect(checkboxes.nth(0)).toBeChecked();
    await expect(checkboxes.nth(1)).toBeChecked();

    // Uncheck one and create
    await checkboxes.nth(1).uncheck();
    await page.fill('#expNameInput', 'MCP Filter Test');
    await page.click('#newExpModal .btn-primary');
    await expect(page.locator('#newExpModal')).not.toHaveClass(/visible/);
  });

  test('per-chat MCP selection in edit chat modal', async ({ page }) => {
    // Save MCP servers first
    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('#settingsTabButtonMcp');

    // Remove any existing servers first
    await clearMcpServers(page);

    await page.click('#settingsAddToolUniverseButton');
    await page.click('#settingsSaveButton');

    // Create a chat
    await page.click('button:has-text("New Chat")');
    await page.fill('#expNameInput', 'MCP Edit Test');
    await page.click('#newExpModal .btn-primary');

    // Open edit modal by clicking title
    await page.click('#expTitle');
    await expect(page.locator('#renameExpModal')).toHaveClass(/visible/);

    // MCP checkboxes should appear
    const checkboxes = page.locator('#editMcpCheckboxes input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(1);
  });

  test('experiment API accepts mcp_servers field', async ({ request }) => {
    // Create experiment with mcp_servers
    const res = await request.post('/api/experiments', {
      data: {
        name: 'MCP API Test',
        mcp_servers: '["ToolUniverse"]',
      },
    });
    expect(res.status()).toBe(201);
    const exp = await res.json();
    expect(exp.mcp_servers).toBe('["ToolUniverse"]');

    // Update mcp_servers
    const patchRes = await request.patch(`/api/experiments/${exp.id}`, {
      data: { mcp_servers: '["deep-research"]' },
    });
    expect(patchRes.ok()).toBeTruthy();

    // Verify update
    const getRes = await request.get('/api/experiments');
    const exps = await getRes.json();
    const updated = exps.find((e: any) => e.id === exp.id);
    expect(updated.mcp_servers).toBe('["deep-research"]');

    // Cleanup
    await request.delete(`/api/experiments/${exp.id}`);
  });
});

// ============================================================
// 5. Chat & Agent (WebSocket flow)
// ============================================================

test.describe('Chat Flow', () => {
  async function createExperiment(page, name: string) {
    await page.click('button:has-text("New Chat")');
    await page.fill('#expNameInput', name);
    await page.click('#newExpModal .btn-primary');
    await expect(page.locator('#messagesArea')).toHaveClass(/visible/);
  }

  async function mockOutputLanguage(page, language: 'ja' | 'en') {
    await page.route('**/api/settings', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ output_language: language }),
        });
        return;
      }
      await route.fallback();
    });
  }

  test('send message via WebSocket and see user message appear', async ({ page }) => {
    await page.goto('/');

    await createExperiment(page, 'Chat Test');
    await expect(page.locator('#inputArea')).toHaveClass(/visible/);

    // Wait for WebSocket to connect
    await page.waitForTimeout(1000);

    // Type and send message
    await page.fill('#chatInput', 'Hello from Playwright');
    await page.click('.btn-send');

    // User message should appear in chat
    await expect(page.locator('.message.user').first()).toBeVisible();
    await expect(page.locator('.message.user .msg-content').first()).toContainText('Hello from Playwright');
  });

  test('assistant messages expose a Copy button that copies the response text', async ({ page }) => {
    await page.addInitScript(() => {
      let copiedText = '';
      Object.defineProperty(window, '__copiedMessageText', {
        configurable: true,
        get() {
          return copiedText;
        },
        set(value) {
          copiedText = String(value);
        },
      });

      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText(text) {
            window.__copiedMessageText = text;
            return Promise.resolve();
          },
        },
      });
    });

    await page.goto('/');
    await createExperiment(page, 'Assistant Copy Button Test');

    await page.evaluate(() => {
      window.appendMessage({
        id: 'assistant-copy-test',
        role: 'assistant',
        content: 'Copied from assistant response\n\n- bullet 1\n- bullet 2',
        timestamp: new Date().toISOString(),
      });
    });

    const assistantMessage = page.locator('.message.assistant').last();
    const copyButton = assistantMessage.locator('.message-copy-btn');

    await expect(copyButton).toBeVisible();
    await expect(copyButton).toHaveText('Copy');

    await copyButton.click();

    await expect(copyButton).toHaveText('Copied!');
    await expect.poll(() => page.evaluate(() => window.__copiedMessageText)).toContain('Copied from assistant response');
    await expect.poll(() => page.evaluate(() => window.__copiedMessageText)).toContain('bullet 1');
  });

  test.describe('Progress UI', () => {
    test('agent status panel shows human-friendly progress text', async ({ page }) => {
      await mockOutputLanguage(page, 'ja');
      await page.goto('/');

      await createExperiment(page, 'Status Panel Test');

      const taskId = 'status-test';
      const samples = [
        ['MCP ToolUniverse: connected', '🧩 ToolUniverse に接続しました'],
        ['MCP github-mcp-server: connected', '🧩 GitHub に接続しました'],
        ['Model selected: claude-sonnet-4.6', '🧠 モデルを選択しました: claude-sonnet-4.6'],
        ['Calling report_intent: Searching literature tools', '🧭 文献検索の進め方を整理中'],
        ['Calling ToolUniverse-find_tools: OpenAlex literature search academic papers', '🔎 OpenAlex で学術論文を検索中'],
        ['Calling ToolUniverse-execute_tool', '📚 文献データベースを検索中...'],
        ['Calling web_search: CRISPR base editing landmark representative papers seminal publications', '📚 CRISPR base editing 関連論文を検索中'],
        ['Completed tool', '✅ ツール実行が完了しました'],
        ['Completed ToolUniverse-execute_tool', '✅ 文献検索 が完了しました'],
      ] as const;

      await page.evaluate(([id]) => {
        window.showStatusPanel(id);
      }, [taskId]);

      for (const [raw, expected] of samples) {
        const stepText = await page.evaluate(([id, line]) => {
          window.updateStatusPanelLine(id, line);
          return document.getElementById('asp-step-' + id)?.textContent || '';
        }, [taskId, raw]);
        expect(stepText).toBe(expected);
      }

      await expect(page.locator('#asp-tools-' + taskId)).toContainText('ツール選定');
      await expect(page.locator('#asp-tools-' + taskId)).toContainText('文献検索');
    });

    test('streaming status shows step badge and progress bar', async ({ page }) => {
      await page.goto('/');

      await createExperiment(page, 'Streaming Status Test');

      const taskId = 'stream-test';
      const streamingText = [
        '## Step 2/5: Search literature sources',
        'Using `OpenAlex_search_papers` to collect candidate papers',
        '',
        'Gathering abstracts and citation counts.'
      ].join('\n');

      const result = await page.evaluate(([id, text]) => {
        window.updateStreamingMessage(text, id);
        const stepEl = document.getElementById('asp-step-' + id);
        const fillEl = document.getElementById('asp-fill-' + id);
        const toolsEl = document.getElementById('asp-tools-' + id);
        return {
          stepText: stepEl?.textContent || '',
          stepHtml: stepEl?.innerHTML || '',
          fillWidth: fillEl?.style.width || '',
          isIndeterminate: fillEl?.classList.contains('indeterminate') || false,
          toolsText: toolsEl?.textContent || '',
        };
      }, [taskId, streamingText]);

      expect(result.stepText).toContain('Step 2/5');
      expect(result.stepText).toContain('Search literature sources');
      expect(result.stepHtml).toContain('asp-step-badge');
      expect(result.fillWidth).toBe('40%');
      expect(result.isIndeterminate).toBe(false);
      expect(result.toolsText).toContain('OpenAlex_search_papers');
    });

    test('streaming status width matches prompt input width', async ({ page }) => {
      await page.goto('/');

      await createExperiment(page, 'Streaming Width Test');

      await page.evaluate(() => {
        window.showStatusPanel('task-width');
      });

      const inputBox = await page.locator('.input-wrapper').boundingBox();
      const streamingBox = await page.locator('#streaming-msg-task-width').boundingBox();

      expect(inputBox).not.toBeNull();
      expect(streamingBox).not.toBeNull();
      expect(Math.abs((streamingBox?.width || 0) - (inputBox?.width || 0))).toBeLessThanOrEqual(1);
    });

    test('streaming status marks the latest tool chip as active', async ({ page }) => {
      await page.goto('/');

      await createExperiment(page, 'Streaming Tool Chip Test');

      const taskId = 'stream-tool-chip-test';
      const streamingText = [
        'Step 3 of 4: Compare evidence and gather metadata',
        'Using `OpenAlex_search_papers` to find candidate studies',
        'Using `Crossref_lookup` to enrich citation metadata',
      ].join('\n');

      await page.evaluate(([id, text]) => {
        window.updateStreamingMessage(text, id);
      }, [taskId, streamingText]);

      const chips = page.locator('#asp-tools-' + taskId + ' .asp-tool-chip');
      await expect(chips).toHaveCount(4);
      await expect(chips.nth(0)).toContainText('OpenAlex_search_papers');
      await expect(chips.nth(2)).toContainText('Crossref_lookup');
      await expect(chips.nth(2)).not.toHaveClass(/active/);
      await expect(chips.nth(3)).toContainText('Crossref');
      await expect(chips.nth(3)).toHaveClass(/active/);
    });

    test('streaming status exposes activity and stop actions only', async ({ page }) => {
      await page.goto('/');

      await createExperiment(page, 'Activity Button Test');

      await page.evaluate(() => {
        activeTasks['task-running'] = {
          experimentId: currentExpId,
          prompt: '',
          streamBuffer: '',
          startedAt: Date.now() - 10_000,
          _lastStatus: 'placeholder',
        };
        window.showStatusPanel('task-running');
      });

      await expect(page.locator('#streaming-msg-task-running .streaming-activity-btn')).toBeVisible();
      await expect(page.locator('#streaming-msg-task-running .streaming-stop-btn')).toBeVisible();
      await expect(page.locator('#streaming-msg-task-running .streaming-history-btn')).toHaveCount(0);
    });

    test('activity log shows literature search entries from process history fallback', async ({ page }) => {
      await mockOutputLanguage(page, 'ja');
      await page.goto('/');

      await createExperiment(page, 'Activity Fallback Test');

      await page.route('**/api/experiments/*/process-history', async (route) => {
        const expId = route.request().url().match(/\/api\/experiments\/([^/]+)\/process-history/)?.[1] || '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            tasks: [
              {
                id: 'task-running',
                experimentId: expId,
                prompt: 'Find recent papers',
                status: 'running',
                startedAt: new Date('2026-03-28T12:00:00.000Z').toISOString(),
                finishedAt: null,
                _lastStatus: 'Calling ToolUniverse-execute_tool',
                _statusHistory: [
                  {
                    message: 'Calling ToolUniverse-execute_tool',
                    timestamp: new Date('2026-03-28T12:00:05.000Z').toISOString(),
                  },
                ],
              },
            ],
          }),
        });
      });
      await page.route('**/api/experiments/*/activity', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ events: [] }),
        });
      });

      await page.evaluate(() => {
        window.showStatusPanel('task-running');
      });

      await page.locator('#streaming-msg-task-running .streaming-activity-btn').click();

      await expect(page.locator('#activityLogModal')).toHaveClass(/visible/);
      await expect(page.locator('#activityLogList')).toContainText('文献データベースを検索中');
      await expect(page.locator('#activityLogList')).not.toContainText('Calling ToolUniverse-execute_tool');
    });

    test('activity log shows created filename for file events', async ({ page }) => {
      await mockOutputLanguage(page, 'ja');
      await page.goto('/');

      await createExperiment(page, 'Activity File Name Test');

      await page.route('**/api/experiments/*/process-history', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });
      await page.route('**/api/experiments/*/activity', async (route) => {
        const expId = route.request().url().match(/\/api\/experiments\/([^/]+)\/activity/)?.[1] || '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            events: [
              {
                id: 'activity-file-create',
                experimentId: expId,
                taskId: 'task-file-create',
                timestamp: new Date('2026-03-28T12:10:00.000Z').toISOString(),
                category: 'file',
                action: 'create',
                message: 'Creating file: reports/daily-summary.md',
                raw: 'Creating file: reports/daily-summary.md',
                filePath: 'reports/daily-summary.md',
              },
            ],
          }),
        });
      });

      await page.evaluate(() => {
        window.showStatusPanel('task-file-create');
      });

      await page.locator('#streaming-msg-task-file-create .streaming-activity-btn').click();

      await expect(page.locator('#activityLogModal')).toHaveClass(/visible/);
      await expect(page.locator('#activityLogList')).toContainText('ファイルを作成: daily-summary.md');
      await expect(page.locator('#activityLogList')).toContainText('ファイル: daily-summary.md');
      await expect(page.locator('#activityLogList')).toContainText('パス: reports/daily-summary.md');
      await expect(page.locator('#activityLogList')).not.toContainText('Creating file: reports/daily-summary.md');
    });

    test('activity log shows which task started', async ({ page }) => {
      await mockOutputLanguage(page, 'ja');
      await page.goto('/');

      await createExperiment(page, 'Activity Task Start Test');

      await page.route('**/api/experiments/*/process-history', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });
      await page.route('**/api/experiments/*/activity', async (route) => {
        const expId = route.request().url().match(/\/api\/experiments\/([^/]+)\/activity/)?.[1] || '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            events: [
              {
                id: 'activity-task-start',
                experimentId: expId,
                taskId: 'task-start-1',
                timestamp: new Date('2026-03-28T12:12:00.000Z').toISOString(),
                category: 'task',
                action: 'start',
                message: 'Task started',
                raw: 'Task started',
                taskPrompt: 'CRISPR base editing の代表論文を調査',
                status: 'running',
              },
            ],
          }),
        });
      });

      await page.evaluate(() => {
        window.showStatusPanel('task-start-1');
      });

      await page.locator('#streaming-msg-task-start-1 .streaming-activity-btn').click();

      await expect(page.locator('#activityLogModal')).toHaveClass(/visible/);
      await expect(page.locator('#activityLogList')).toContainText('タスクを開始: CRISPR base editing の代表論文を調査');
      await expect(page.locator('#activityLogList')).toContainText('内容: CRISPR base editing の代表論文を調査');
      await expect(page.locator('#activityLogList')).not.toContainText('Task started');
    });

    test('activity log shows which task completed', async ({ page }) => {
      await mockOutputLanguage(page, 'ja');
      await page.goto('/');

      await createExperiment(page, 'Activity Task Complete Test');

      await page.route('**/api/experiments/*/process-history', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });
      await page.route('**/api/experiments/*/activity', async (route) => {
        const expId = route.request().url().match(/\/api\/experiments\/([^/]+)\/activity/)?.[1] || '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            events: [
              {
                id: 'activity-task-complete',
                experimentId: expId,
                taskId: 'task-complete-1',
                timestamp: new Date('2026-03-28T12:13:00.000Z').toISOString(),
                category: 'task',
                action: 'complete',
                message: 'Task completed',
                raw: 'Task completed',
                taskPrompt: 'CRISPR base editing の代表論文を調査',
                status: 'done',
              },
            ],
          }),
        });
      });

      await page.evaluate(() => {
        window.showStatusPanel('task-complete-1');
      });

      await page.locator('#streaming-msg-task-complete-1 .streaming-activity-btn').click();

      await expect(page.locator('#activityLogModal')).toHaveClass(/visible/);
      await expect(page.locator('#activityLogList')).toContainText('タスク完了: CRISPR base editing の代表論文を調査');
      await expect(page.locator('#activityLogList')).toContainText('内容: CRISPR base editing の代表論文を調査');
      await expect(page.locator('#activityLogList')).toContainText('状態: done');
      await expect(page.locator('#activityLogList')).not.toContainText('Task completed');
    });

    test('activity log uses English labels when output language is English', async ({ page }) => {
      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ output_language: 'en' }),
          });
          return;
        }
        await route.fallback();
      });

      await page.goto('/');

      await createExperiment(page, 'Activity English Test');

      await page.route('**/api/experiments/*/process-history', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });
      await page.route('**/api/experiments/*/activity', async (route) => {
        const expId = route.request().url().match(/\/api\/experiments\/([^/]+)\/activity/)?.[1] || '';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            events: [
              {
                id: 'activity-task-start-en',
                experimentId: expId,
                taskId: 'task-start-en',
                timestamp: new Date('2026-03-28T12:12:00.000Z').toISOString(),
                category: 'task',
                action: 'start',
                message: 'Task started',
                raw: 'Task started',
                taskPrompt: 'Investigate representative CRISPR base editing papers',
                status: 'running',
              },
            ],
          }),
        });
      });

      await page.evaluate(() => {
        window.showStatusPanel('task-start-en');
      });

      await page.locator('#streaming-msg-task-start-en .streaming-activity-btn').click();

      await expect(page.locator('#activityLogList')).toContainText('Task started: Investigate representative CRISPR base editing papers');
      await expect(page.locator('#activityLogList')).toContainText('Prompt: Investigate representative CRISPR base editing papers');
      await expect(page.locator('#activityLogList')).not.toContainText('タスクを開始');
    });

    test('activity modal chrome uses English when output language is English', async ({ page }) => {
      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ output_language: 'en' }),
          });
          return;
        }
        await route.fallback();
      });

      await page.goto('/');

      await createExperiment(page, 'Activity Modal English Test');

      await page.route('**/api/experiments/*/process-history', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tasks: [] }),
        });
      });
      await page.route('**/api/experiments/*/activity', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ events: [] }),
        });
      });

      await page.evaluate(() => {
        window.showStatusPanel('activity-modal-en');
      });

      await page.locator('#streaming-msg-activity-modal-en .streaming-activity-btn').click();

      await expect(page.locator('#activityLogTitle')).toHaveText('📋 Activity');
      await expect(page.locator('#activityLogFilter')).toHaveValue('all');
      await expect(page.locator('#activityLogFilter option:checked')).toHaveText('All activity');
      await expect(page.locator('#activityLogTaskFilter option')).toHaveText('All tasks');
      await expect(page.locator('#activityLogSearch')).toHaveAttribute('placeholder', 'Search by message, path, command, or tool...');
      await expect(page.locator('#activityLogSummary')).toHaveText('No activity yet.');
      await expect(page.locator('#activityLogList')).toContainText('No activity matches the current filters.');
      await expect(page.locator('#activityLogFooterCloseButton')).toHaveText('Close');
      await expect(page.locator('#activityLogModal')).not.toContainText('すべてのアクティビティ');
      await expect(page.locator('#activityLogModal')).not.toContainText('すべてのタスク');
    });

    test('streaming status uses English when output language is English', async ({ page }) => {
      await page.route('**/api/settings', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ output_language: 'en' }),
          });
          return;
        }
        await route.fallback();
      });

      await page.goto('/');

      await createExperiment(page, 'Streaming English Test');

      const experimentId = await page.evaluate(() => currentExpId);
      const taskId = 'streaming-en-task';

      await page.evaluate(([expId, id]) => {
        const emit = (payload) => ws.onmessage({ data: JSON.stringify(payload) });
        emit({ experimentId: expId, type: 'agent_start', taskId: id });
        emit({ experimentId: expId, type: 'agent_status', taskId: id, status: 'Calling ToolUniverse-execute_tool: OpenAlex literature search academic papers' });
      }, [experimentId, taskId]);

      await expect(page.locator('#asp-step-' + taskId)).toContainText('Searching academic papers on OpenAlex');
      await expect(page.locator('#asp-step-' + taskId)).not.toContainText('学術論文');
    });

    test('websocket event sequence updates progress panel and final message', async ({ page }) => {
      await page.goto('/');

      await createExperiment(page, 'WebSocket Status Sequence Test');

      const experimentId = await page.evaluate(() => currentExpId);
      const taskId = 'ws-sequence-task';
      const assistantMessage = {
        id: 'ws-sequence-msg',
        experiment_id: experimentId,
        role: 'assistant',
        content: '最終的な論文要約メッセージです。',
        timestamp: new Date().toISOString(),
      };

      await page.evaluate(([expId, id]) => {
        const emit = (payload) => ws.onmessage({ data: JSON.stringify(payload) });

        emit({ experimentId: expId, type: 'agent_start', taskId: id });
        emit({ experimentId: expId, type: 'agent_status', taskId: id, status: 'Calling ToolUniverse-find_tools: OpenAlex literature search academic papers' });
        emit({ experimentId: expId, type: 'agent_chunk', taskId: id, chunk: '## Step 1/3: Search literature\nUsing `OpenAlex_search_papers` to collect evidence\n' });
      }, [experimentId, taskId]);

      await expect(page.locator('#streaming-msg-' + taskId)).toBeVisible();
      await expect(page.locator('#asp-step-' + taskId)).toContainText('Step 1/3');
      await expect(page.locator('#asp-step-' + taskId)).toContainText('Search literature');
      await expect(page.locator('#asp-tools-' + taskId)).toContainText('OpenAlex_search_papers');

      await page.evaluate(([expId, id, message]) => {
        const emit = (payload) => ws.onmessage({ data: JSON.stringify(payload) });
        emit({ experimentId: expId, type: 'agent_status', taskId: id, status: 'Completed ToolUniverse-find_tools' });
        emit({ experimentId: expId, type: 'agent_done', taskId: id, message });
      }, [experimentId, taskId, assistantMessage]);

      await expect(page.locator('#streaming-msg-' + taskId)).toHaveCount(0);
      await expect(page.locator('.message.assistant').last()).toContainText('最終的な論文要約メッセージです。');

      const allAssistantText = await page.locator('.message.assistant').last().textContent();
      expect(allAssistantText).toContain('最終的な論文要約メッセージです。');
    });

    test('tasks event restores running task progress after reconnect', async ({ page }) => {
      await page.goto('/');

      await createExperiment(page, 'Task Restore Test');

      const experimentId = await page.evaluate(() => currentExpId);
      const taskId = 'restored-task';
      const startedAt = new Date(Date.now() - 45_000).toISOString();
      const prompt = 'CRISPR literature review for restore test';
      const streamingText = [
        '## Step 2/4: Compare candidate papers',
        'Using `OpenAlex_search_papers` to gather abstracts',
        'Using `Crossref_lookup` to enrich metadata',
      ].join('\n');

      await page.evaluate(([expId, id, started, taskPrompt, text]) => {
        ws.onmessage({
          data: JSON.stringify({
            type: 'tasks',
            tasks: [{
              id,
              experimentId: expId,
              prompt: taskPrompt,
              status: 'running',
              startedAt: started,
              streamingText: text,
              _lastStatus: 'Calling ToolUniverse-find_tools: OpenAlex literature search academic papers',
            }],
          }),
        });
      }, [experimentId, taskId, startedAt, prompt, streamingText]);

      await expect(page.locator('#streaming-msg-' + taskId)).toBeVisible();
      await expect(page.locator('#tasksBar')).toHaveCount(0);
      await expect(page.locator('#asp-step-' + taskId)).toContainText('Step 2/4');
      await expect(page.locator('#asp-step-' + taskId)).toContainText('Compare candidate papers');
      await expect(page.locator('#asp-tools-' + taskId)).toContainText('OpenAlex_search_papers');
      await expect(page.locator('#asp-tools-' + taskId)).toContainText('Crossref_lookup');
      await expect(page.locator('#asp-elapsed-' + taskId)).not.toHaveText('0s');
    });

    test('mock websocket sends subscribe and restores tasks payload', async ({ page }) => {
      await page.addInitScript(() => {
        class MockWebSocket {
          static OPEN = 1;
          static CLOSED = 3;

          constructor(url) {
            this.url = url;
            this.readyState = MockWebSocket.OPEN;
            this.sent = [];
            this.onopen = null;
            this.onmessage = null;
            this.onerror = null;
            this.onclose = null;
            window.__mockSockets = window.__mockSockets || [];
            window.__mockSockets.push(this);
            setTimeout(() => {
              if (this.onopen) this.onopen();
            }, 0);
          }

          send(payload) {
            this.sent.push(payload);
          }

          close() {
            this.readyState = MockWebSocket.CLOSED;
            if (this.onclose) this.onclose();
          }

          emitMessage(payload) {
            if (this.onmessage) {
              this.onmessage({ data: JSON.stringify(payload) });
            }
          }
        }

        window.__mockSockets = [];
        window.WebSocket = MockWebSocket;
      });

      await page.goto('/');

      await createExperiment(page, 'Mock WebSocket Test');

      const state = await page.evaluate(() => {
        const socket = window.__mockSockets[0];
        return {
          currentExpId,
          sent: socket ? socket.sent.map((raw) => JSON.parse(raw)) : [],
        };
      });

      expect(state.sent.some((msg) => msg.type === 'list_tasks')).toBe(true);
      expect(state.sent.some((msg) => msg.type === 'subscribe' && msg.experimentId === state.currentExpId)).toBe(true);

      const taskId = 'mock-restored-task';
      const startedAt = new Date(Date.now() - 30_000).toISOString();

      await page.evaluate(([expId, id, started]) => {
        const socket = window.__mockSockets[0];
        socket.emitMessage({
          type: 'tasks',
          tasks: [{
            id,
            experimentId: expId,
            prompt: 'Mock websocket restore prompt',
            status: 'running',
            startedAt: started,
            streamingText: '## Step 2/3: Review evidence\nUsing `OpenAlex_search_papers` to compare abstracts',
            _lastStatus: 'Calling ToolUniverse-find_tools: OpenAlex literature search academic papers',
          }],
        });
      }, [state.currentExpId, taskId, startedAt]);

      await expect(page.locator('#tasksBar')).toHaveCount(0);
      await expect(page.locator('#streaming-msg-' + taskId)).toBeVisible();
      await expect(page.locator('#asp-step-' + taskId)).toContainText('Step 2/3');
      await expect(page.locator('#asp-tools-' + taskId)).toContainText('OpenAlex_search_papers');
    });

  });
});

// ============================================================
// 6. API Tests
// ============================================================

test.describe('REST API', () => {
  test('GET /api/experiments returns array', async ({ request }) => {
    const res = await request.get('/api/experiments');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBeTruthy();
  });

  test('POST /api/experiments creates experiment', async ({ request }) => {
    const res = await request.post('/api/experiments', {
      data: { name: 'API Test', description: 'Created via API' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('API Test');
    expect(body.id).toBeTruthy();

    // Cleanup
    await request.delete(`/api/experiments/${body.id}`);
  });

  test('GET /api/experiments/:id/download includes empty directories in ZIP', async ({ request }) => {
    const createRes = await request.post('/api/experiments', {
      data: { name: 'ZIP Tree Test', description: 'Artifacts ZIP coverage' },
    });
    expect(createRes.status()).toBe(201);
    const exp = await createRes.json();

    const workspaceDir = path.join(process.cwd(), 'groups', `experiment-${exp.id}`);
    const artifactsDir = path.join(process.cwd(), 'data', 'experiments', exp.id, 'artifacts');

    fs.mkdirSync(path.join(workspaceDir, 'results', 'empty-child'), { recursive: true });
    fs.mkdirSync(path.join(artifactsDir, 'figures'), { recursive: true });
    fs.writeFileSync(path.join(workspaceDir, 'report.md'), '# Report\n');
    fs.writeFileSync(path.join(artifactsDir, 'figures', 'plot.json'), '{"ok":true}\n');

    try {
      const res = await request.get(`/api/experiments/${exp.id}/download`);
      expect(res.ok()).toBeTruthy();
      expect(res.headers()['content-type']).toContain('application/zip');

      const names = listZipEntryNames(Buffer.from(await res.body()));
      expect(names).toContain('results/');
      expect(names).toContain('results/empty-child/');
      expect(names).toContain('report.md');
      expect(names).toContain('figures/');
      expect(names).toContain('figures/plot.json');
    } finally {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
      fs.rmSync(path.join(process.cwd(), 'data', 'experiments', exp.id), { recursive: true, force: true });
      await request.delete(`/api/experiments/${exp.id}`);
    }
  });

  test('GET /api/skills returns created skills', async ({ request }) => {
    const skillName = `api-skill-${Date.now()}`;

    const createRes = await request.post('/api/skills', {
      data: {
        name: skillName,
        description: 'Temporary API test skill',
      },
    });
    expect(createRes.ok()).toBeTruthy();

    const res = await request.get('/api/skills');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    const createdSkill = body.find((skill: { name?: string }) => skill.name === skillName);
    expect(createdSkill).toBeTruthy();
    expect(createdSkill).toHaveProperty('version');

    await request.delete(`/api/skills/${skillName}`);
  });

  test('GET /api/experiments/:id/artifacts/:path supports Japanese filenames for view and download', async ({ request }) => {
    const createRes = await request.post('/api/experiments', {
      data: { name: 'Japanese Artifact API Test', description: 'Artifact filename encoding coverage' },
    });
    expect(createRes.ok()).toBeTruthy();
    const exp = await createRes.json();

    const artifactName = '結果レポート.md';
    const artifactPath = path.join(process.cwd(), 'data', 'experiments', exp.id, 'artifacts', artifactName);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, '# 結果\n\n日本語ファイル名の API 確認\n');

    try {
      const encodedPath = encodeURIComponent(artifactName);

      const viewRes = await request.get(`/api/experiments/${exp.id}/artifacts/${encodedPath}`);
      expect(viewRes.ok()).toBeTruthy();
      expect(viewRes.headers()['content-type']).toContain('text/markdown');
      expect(viewRes.headers()['content-disposition']).toContain("filename*=UTF-8''%E7%B5%90%E6%9E%9C%E3%83%AC%E3%83%9D%E3%83%BC%E3%83%88.md");
      expect(await viewRes.text()).toContain('日本語ファイル名の API 確認');

      const downloadRes = await request.get(`/api/experiments/${exp.id}/artifacts/${encodedPath}?download=1`);
      expect(downloadRes.ok()).toBeTruthy();
      expect(downloadRes.headers()['content-disposition']).toContain('attachment;');
      expect(downloadRes.headers()['content-disposition']).toContain("filename*=UTF-8''%E7%B5%90%E6%9E%9C%E3%83%AC%E3%83%9D%E3%83%BC%E3%83%88.md");
    } finally {
      fs.rmSync(path.join(process.cwd(), 'data', 'experiments', exp.id), { recursive: true, force: true });
      fs.rmSync(path.join(process.cwd(), 'groups', `experiment-${exp.id}`), { recursive: true, force: true });
      await request.delete(`/api/experiments/${exp.id}`);
    }
  });

  test('PUT /api/skills accepts nested package ZIP uploads without a root SKILL.md', async ({ request }) => {
    const skillName = `zip-package-${Date.now()}`;
    const subskillName = `${skillName}-subskill`;
    const uploadedSkillDir = path.join(process.cwd(), 'skills', skillName);
    const zipBuffer = buildZipBuffer([
      {
        name: `${skillName}/group.json`,
        data: JSON.stringify({
          name: skillName,
          description: 'ZIP package test skill',
        }, null, 2),
      },
      {
        name: `${skillName}/skills/${subskillName}/SKILL.md`,
        data: `---\nname: ${subskillName}\nversion: v2.0.0\n---\n\n# ${subskillName}\n`,
      },
    ]);

    try {
      const uploadRes = await request.put(`/api/skills/${skillName}`, {
        headers: {
          'content-type': 'application/zip',
        },
        data: zipBuffer,
      });

      expect(uploadRes.ok()).toBeTruthy();
      expect(await uploadRes.json()).toEqual(expect.objectContaining({
        name: skillName,
        updated: true,
      }));

      expect(fs.existsSync(path.join(uploadedSkillDir, 'SKILL.md'))).toBe(false);
      expect(fs.existsSync(path.join(uploadedSkillDir, 'group.json'))).toBe(true);
      expect(fs.existsSync(path.join(uploadedSkillDir, 'skills', subskillName, 'SKILL.md'))).toBe(true);

      const res = await request.get('/api/skills');
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      const uploadedSkill = body.find((skill: { name?: string }) => skill.name === skillName);
      expect(uploadedSkill).toBeTruthy();
      expect(uploadedSkill.version).toBe('v2.0.0');
    } finally {
      fs.rmSync(uploadedSkillDir, { recursive: true, force: true });
    }
  });

  test('PUT /api/skills accepts nested package ZIP uploads inside wrapper directories', async ({ request }) => {
    const skillName = `zip-wrapper-${Date.now()}`;
    const subskillName = `${skillName}-subskill`;
    const uploadedSkillDir = path.join(process.cwd(), 'skills', skillName);
    const zipBuffer = buildZipBuffer([
      {
        name: `coreclaw-marketplace-main/coreclaw-skills-hub/skills/${skillName}/group.json`,
        data: JSON.stringify({
          name: skillName,
          description: 'Wrapped ZIP package test skill',
        }, null, 2),
      },
      {
        name: `coreclaw-marketplace-main/coreclaw-skills-hub/skills/${skillName}/skills/${subskillName}/SKILL.md`,
        data: `---\nname: ${subskillName}\nversion: v3.0.0\n---\n\n# ${subskillName}\n`,
      },
    ]);

    try {
      const uploadRes = await request.put(`/api/skills/${skillName}`, {
        headers: {
          'content-type': 'application/zip',
        },
        data: zipBuffer,
      });

      expect(uploadRes.ok()).toBeTruthy();
      expect(await uploadRes.json()).toEqual(expect.objectContaining({
        name: skillName,
        updated: true,
      }));

      expect(fs.existsSync(path.join(uploadedSkillDir, 'group.json'))).toBe(true);
      expect(fs.existsSync(path.join(uploadedSkillDir, 'skills', subskillName, 'SKILL.md'))).toBe(true);

      const res = await request.get('/api/skills');
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      const uploadedSkill = body.find((skill: { name?: string }) => skill.name === skillName);
      expect(uploadedSkill).toBeTruthy();
      expect(uploadedSkill.version).toBe('v3.0.0');
    } finally {
      fs.rmSync(uploadedSkillDir, { recursive: true, force: true });
    }
  });

  test('GET /api/skills prefers marketplace import version for imported skills', async ({ request }) => {
    const skillName = `marketplace-version-${Date.now()}`;
    const skillDir = path.join(process.cwd(), 'skills', skillName);

    fs.mkdirSync(path.join(skillDir, 'skills', `${skillName}-subskill`), { recursive: true });
    fs.writeFileSync(path.join(skillDir, 'group.json'), JSON.stringify({
      name: skillName,
      description: 'Marketplace imported package',
    }, null, 2));
    fs.writeFileSync(
      path.join(skillDir, 'skills', `${skillName}-subskill`, 'SKILL.md'),
      `---\nname: ${skillName}-subskill\nversion: v1.0.0\n---\n\n# ${skillName}\n`,
    );
    fs.writeFileSync(path.join(skillDir, '.coreclaw-marketplace.json'), JSON.stringify({
      slug: skillName,
      version: 'v1.1.0',
      importedAt: new Date().toISOString(),
    }, null, 2));

    try {
      const res = await request.get('/api/skills');
      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      const importedSkill = body.find((skill: { name?: string }) => skill.name === skillName);
      expect(importedSkill).toBeTruthy();
      expect(importedSkill.marketplaceImported).toBe(true);
      expect(importedSkill.version).toBe('v1.1.0');
    } finally {
      fs.rmSync(skillDir, { recursive: true, force: true });
    }
  });

  test('PUT /api/settings saves and GET returns masked tokens', async ({ request }) => {
    // Save original settings for restoration
    const origRes = await request.get('/api/settings');
    const origSettings = await origRes.json();

    const res = await request.put('/api/settings', {
      data: {
        github_token: 'ghp_testtoken123456',
        output_language: 'en',
        ai_provider: 'ollama',
        ollama_url: 'http://localhost:11434',
        ollama_model: 'llama3.3',
      },
    });
    expect(res.ok()).toBeTruthy();

    const getRes = await request.get('/api/settings');
    const settings = await getRes.json();
    expect(settings.output_language).toBe('en');
    expect(settings.ai_provider).toBe('ollama');
    expect(settings.ollama_url).toBe('http://localhost:11434');
    expect(settings.ollama_model).toBe('llama3.3');
    // Token should be masked
    expect(settings.github_token).toContain('•');
    expect(settings.github_token).toMatch(/3456$/);

    // Restore original settings (clear test token to avoid breaking real agent)
    await request.put('/api/settings', {
      data: {
        github_token: '',
        output_language: origSettings.output_language || 'ja',
        ai_provider: origSettings.ai_provider || '',
        ollama_url: origSettings.ollama_url || '',
        ollama_model: origSettings.ollama_model || '',
      },
    });
  });
});
