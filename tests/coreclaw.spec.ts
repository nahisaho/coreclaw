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
  test('open and close settings modal', async ({ page }) => {
    await page.goto('/');

    await page.click('.settings-btn');
    await expect(page.locator('#settingsModal')).toHaveClass(/visible/);

    // Close with X button
    await page.click('#settingsModal .modal-close');
    await expect(page.locator('#settingsModal')).not.toHaveClass(/visible/);
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
    await page.click('.btn-add-mcp');
    // MCP server card should appear
    await expect(page.locator('.mcp-server-card')).toHaveCount(1);
  });

  test('add multiple MCP servers and remove one', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('button:has-text("MCP Servers")');

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

    await page.click('button:has-text("ToolUniverse")');
    await expect(page.locator('.mcp-server-card')).toHaveCount(1);

    // Verify preset values
    const card = page.locator('.mcp-server-card').first();
    await expect(card.locator('input.mcp-name')).toHaveValue('ToolUniverse');
    await expect(card.locator('input[placeholder*="Command"]')).toHaveValue('uvx');
    await expect(card.locator('input[placeholder*="Args"]')).toHaveValue('tooluniverse-smcp-stdio --compact-mode');
  });

  test('add Deep Research preset', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('button:has-text("MCP Servers")');

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

  test('MCP servers persist via settings save/reload', async ({ page }) => {
    await page.goto('/');
    await page.click('.settings-btn');
    await page.click('button:has-text("MCP Servers")');

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
    while (await page.locator('.mcp-server-card').count() > 0) {
      await page.locator('.mcp-server-card').first().locator('.mcp-remove').click();
    }

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
    while (await page.locator('.mcp-server-card').count() > 0) {
      await page.locator('.mcp-server-card').first().locator('.mcp-remove').click();
    }

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
  test('send message via WebSocket and see user message appear', async ({ page }) => {
    await page.goto('/');

    // Create experiment
    await page.click('button:has-text("New Chat")');
    await page.fill('#expNameInput', 'Chat Test');
    await page.click('#newExpModal .btn-primary');
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
