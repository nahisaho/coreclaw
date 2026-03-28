import { test, expect } from '@playwright/test';

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

  test('shows skill count in sidebar', async ({ page }) => {
    await page.goto('/');
    const skillCount = page.locator('#skillCount');
    await expect(skillCount).toBeVisible();
    // Should show a number >= 0 (local skills directory)
    await expect(skillCount).toBeVisible();
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

    await page.goto('/');
    await page.locator('#stopServerBtn').click();

    await expect(page.locator('#stopServerBtn')).toHaveText('✅');
    expect(shutdownRequested).toBe(true);
  });

  test('provider toggle switches between OpenAI / Azure / Ollama', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');

    // Switch to STT Provider tab
    await page.click('button:has-text("STT Provider")');

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

    // Switch to GitHub tab
    await page.click('button:has-text("GitHub")');
    await page.fill('#settingsGithubUser', 'test-user');
    await page.click('#settingsModal button:has-text("Save")');

    // Save closes the modal
    await expect(page.locator('#settingsModal')).not.toHaveClass(/visible/);

    // Reopen settings — values should persist
    await page.click('.settings-btn');
    await expect(page.locator('#settingsGithubUser')).toHaveValue('test-user');
  });

  test('add MCP server manually', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');

    // Switch to MCP Servers tab
    await page.click('button:has-text("MCP Servers")');
    await clearMcpServers(page);
    await page.click('.btn-add-mcp');
    // MCP server card should appear
    await expect(page.locator('.mcp-server-card')).toHaveCount(1);
  });

  test('add multiple MCP servers and remove one', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('button:has-text("MCP Servers")');
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
    await page.click('button:has-text("MCP Servers")');
    await clearMcpServers(page);

    await page.click('button:has-text("ToolUniverse")');
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
    await page.click('button:has-text("MCP Servers")');
    await clearMcpServers(page);

    await page.click('button:has-text("ToolUniverse")');
    await page.click('button:has-text("ToolUniverse")');

    await expect(page.locator('.mcp-server-card')).toHaveCount(1);
    await expect(page.locator('.mcp-server-card input.mcp-name')).toHaveValue('ToolUniverse');
  });

  test('add Deep Research preset', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('button:has-text("MCP Servers")');
    await clearMcpServers(page);

    await page.click('button:has-text("Deep Research")');
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
    await page.click('button:has-text("MCP Servers")');
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
    await page.click('button:has-text("Skills")');

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
    await page.click('button:has-text("Skills")');
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
    await page.click('button:has-text("Skills")');

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
    await page.click('button:has-text("Skills")');

    const marketplace = page.locator('#marketplaceSkillList');
    await expect(marketplace).toContainText('First state');
    await expect(marketplace).toContainText('Version v0.1.0');
    await expect(marketplace).toContainText('Installed');

    await page.click('button:has-text("Updates")');
    await page.click('button:has-text("Skills")');

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
    await page.click('button:has-text("Skills")');

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
    await page.click('button:has-text("Skills")');

    const skills = page.locator('#skillList');
    await expect(skills).toContainText('Version v1.2.3');
    await expect(skills).toContainText('Update available: v1.2.4');
    await expect(skills.locator('button:has-text("Check")')).toBeVisible();
    await expect(page.locator('#skillList').getByRole('button', { name: 'Update', exact: true })).toBeEnabled();
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
    await page.click('button:has-text("Skills")');
    await page.locator('#skillList button:has-text("Check")').click();

    const skills = page.locator('#skillList');
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
    await page.click('button:has-text("Updates")');
    await page.locator('#check-coreclaw').click();
    await expect(page.locator('#update-coreclaw')).toBeEnabled();
    await page.locator('#update-coreclaw').click();
    await page.waitForTimeout(200);

    expect(dialogSeen).toBe(false);
  });

  test('MCP servers persist via settings save/reload', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('button:has-text("MCP Servers")');
    await clearMcpServers(page);

    // Add a ToolUniverse preset
    await page.click('button:has-text("ToolUniverse")');
    await expect(page.locator('.mcp-server-card')).toHaveCount(1);

    // Save settings
    await page.click('#settingsModal button:has-text("Save")');
    await expect(page.locator('#settingsModal')).not.toHaveClass(/visible/);

    // Reopen settings
    await page.click('.settings-btn');
    await page.click('button:has-text("MCP Servers")');

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
    await page.click('button:has-text("MCP Servers")');

    // Remove any existing servers first
    await clearMcpServers(page);

    await page.click('button:has-text("ToolUniverse")');
    await page.click('button:has-text("Deep Research")');
    await page.click('#settingsModal button:has-text("Save")');

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
    await page.click('button:has-text("MCP Servers")');

    // Remove any existing servers first
    await clearMcpServers(page);

    await page.click('button:has-text("ToolUniverse")');
    await page.click('#settingsModal button:has-text("Save")');

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

  test.describe('Progress UI', () => {
    test('agent status panel shows human-friendly progress text', async ({ page }) => {
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

  test('GET /api/skills returns skills', async ({ request }) => {
    const res = await request.get('/api/skills');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0]).toHaveProperty('version');
  });

  test('PUT /api/settings saves and GET returns masked tokens', async ({ request }) => {
    // Save original settings for restoration
    const origRes = await request.get('/api/settings');
    const origSettings = await origRes.json();

    const res = await request.put('/api/settings', {
      data: {
        github_token: 'ghp_testtoken123456',
        ai_provider: 'ollama',
        ollama_url: 'http://localhost:11434',
        ollama_model: 'llama3.3',
      },
    });
    expect(res.ok()).toBeTruthy();

    const getRes = await request.get('/api/settings');
    const settings = await getRes.json();
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
        ai_provider: origSettings.ai_provider || '',
        ollama_url: origSettings.ollama_url || '',
        ollama_model: origSettings.ollama_model || '',
      },
    });
  });
});
