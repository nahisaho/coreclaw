import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getCustomMarketplaceSource,
  getMarketplaceImportMetadata,
  getSkillMetadata,
  importMarketplaceSkillGroupFromDir,
  isMarketplaceImportedSkill,
  listAvailableSkills,
  listMarketplaceSkillGroups,
} from './skills-sync.js';

describe('skills-sync marketplace helpers', () => {
  const originalCwd = process.cwd();
  const originalGithubToken = process.env.GITHUB_TOKEN;
  let tempDir = '';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coreclaw-skills-test-'));
    process.chdir(tempDir);
    fs.mkdirSync(path.join(tempDir, 'skills'), { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalGithubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalGithubToken;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('adds GitHub authorization headers to marketplace API requests when a token is available', async () => {
    process.env.GITHUB_TOKEN = 'ghp_testtoken123';
    const seenHeaders: Array<Record<string, string>> = [];

    const fetchMock = (async (_input, init) => {
      seenHeaders.push((init?.headers || {}) as Record<string, string>);
      return new Response(JSON.stringify([]), { status: 200 });
    }) as typeof fetch;

    await listMarketplaceSkillGroups(fetchMock);

    expect(seenHeaders[0]?.Authorization).toBe('Bearer ghp_testtoken123');
    expect(seenHeaders[0]?.['X-GitHub-Api-Version']).toBe('2022-11-28');
  });

  it('lists marketplace skill groups with installed status and metadata', async () => {
    fs.mkdirSync(path.join(tempDir, 'skills', 'scientist', 'skills', 'scientific-demo'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'skills', 'scientist', 'skills', 'scientific-demo', 'SKILL.md'), '# local');

    const fetchMock = (async (input) => {
      const url = String(input);
      if (url.endsWith('/coreclaw-skills-hub/skills')) {
        return new Response(JSON.stringify([
          { name: 'scientist', type: 'dir' },
          { name: 'consultant', type: 'dir' },
        ]), { status: 200 });
      }
      if (url.endsWith('/scientist/group.json')) {
        return new Response(JSON.stringify({
          name: 'Scientist',
          description: 'Research pack',
          icon: '🔬',
          count: 196,
        }), { status: 200 });
      }
      if (url.endsWith('/scientist/skill.json')) {
        return new Response(JSON.stringify({
          version: 'v1.2.3',
        }), { status: 200 });
      }
      if (url.endsWith('/consultant/group.json')) {
        return new Response(JSON.stringify({
          name: 'Consultant',
          description: 'Consulting pack',
          icon: '💼',
          count: 42,
        }), { status: 200 });
      }
      if (url.endsWith('/consultant/skill.json')) {
        return new Response(JSON.stringify({
          version: 'v0.4.0',
        }), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const groups = await listMarketplaceSkillGroups(fetchMock);
    expect(groups).toEqual([
      {
        slug: 'consultant',
        name: 'Consultant',
        description: 'Consulting pack',
        icon: '💼',
        version: 'v0.4.0',
        count: 42,
        installed: false,
        sourceId: 'official',
        sourceLabel: 'Marketplace',
        repoUrl: 'https://github.com/nahisaho/coreclaw-marketplace',
      },
      {
        slug: 'scientist',
        name: 'Scientist',
        description: 'Research pack',
        icon: '🔬',
        version: 'v1.2.3',
        count: 196,
        installed: true,
        sourceId: 'official',
        sourceLabel: 'Marketplace',
        repoUrl: 'https://github.com/nahisaho/coreclaw-marketplace',
      },
    ]);
  });

  it('lists skill groups from a custom My SKILLS repository source', async () => {
    const fetchMock = (async (input) => {
      const url = String(input);
      if (url.endsWith('/skills')) {
        return new Response(JSON.stringify([
          { name: 'designer-pack', type: 'dir' },
        ]), { status: 200 });
      }
      if (url.endsWith('/skills/designer-pack/group.json')) {
        return new Response(JSON.stringify({
          name: 'Designer Pack',
          description: 'Custom design helpers',
          icon: '🎨',
          count: 5,
        }), { status: 200 });
      }
      if (url.endsWith('/skills/designer-pack/skill.json')) {
        return new Response(JSON.stringify({ version: 'v2.0.0' }), { status: 200 });
      }
      throw new Error(`Unexpected URL: ${url}`);
    }) as typeof fetch;

    const groups = await listMarketplaceSkillGroups(
      getCustomMarketplaceSource('https://github.com/example/my-skills'),
      fetchMock,
    );

    expect(groups).toEqual([
      {
        slug: 'designer-pack',
        name: 'Designer Pack',
        description: 'Custom design helpers',
        icon: '🎨',
        version: 'v2.0.0',
        count: 5,
        installed: false,
        sourceId: 'my-skills',
        sourceLabel: 'My SKILLS',
        repoUrl: 'https://github.com/example/my-skills',
      },
    ]);
  });

  it('imports a marketplace skill package from a source directory', () => {
    const sourceDir = path.join(tempDir, 'marketplace', 'scientist');
    fs.mkdirSync(path.join(sourceDir, 'skills', 'scientific-demo'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'source'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'group.json'), '{"name":"Scientist","description":"Research pack"}');
    fs.writeFileSync(path.join(sourceDir, 'README.md'), 'package readme');
    fs.writeFileSync(path.join(sourceDir, 'main.py'), 'print("wrapper")');
    fs.writeFileSync(path.join(sourceDir, 'skill.json'), '{"entrypoint":"main.py","version":"v0.2.0"}');
    fs.writeFileSync(path.join(sourceDir, 'source', 'SKILL.md'), '# Package source');
    fs.writeFileSync(path.join(sourceDir, 'skills', 'scientific-demo', 'SKILL.md'), '# Subskill');

    const imported = importMarketplaceSkillGroupFromDir(sourceDir, 'scientist');
    expect(imported.updated).toBe(false);
    expect(imported.fileCount).toBe(2);
    expect(listAvailableSkills()).toEqual(['scientist']);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'SKILL.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'group.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'skills', 'scientific-demo', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'README.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'main.py'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'skill.json'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'source'))).toBe(false);
    expect(getMarketplaceImportMetadata('scientist')).toEqual({
      slug: 'scientist',
      version: 'v0.2.0',
      importedAt: expect.any(String),
      sourceId: 'official',
      sourceLabel: 'Marketplace',
      repoUrl: 'https://github.com/nahisaho/coreclaw-marketplace',
    });
    expect(isMarketplaceImportedSkill('scientist')).toBe(true);
    expect(getSkillMetadata('scientist')).toEqual({
      name: 'Scientist',
      description: 'Research pack',
      version: 'v0.2.0',
    });

    fs.mkdirSync(path.join(tempDir, 'skills', 'scientist', 'prompts'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'skills', 'scientist', 'prompts', 'local.md'), 'keep me');

    fs.writeFileSync(path.join(sourceDir, 'skills', 'scientific-demo', 'README.md'), 'updated');
    const updated = importMarketplaceSkillGroupFromDir(sourceDir, 'scientist');
    expect(updated.updated).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'skills', 'scientific-demo', 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'prompts', 'local.md'))).toBe(true);
  });

  it('stores My SKILLS source metadata when importing a custom pack', () => {
    const sourceDir = path.join(tempDir, 'marketplace', 'designer-pack');
    fs.mkdirSync(path.join(sourceDir, 'skills', 'designer-demo'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'group.json'), '{"name":"Designer Pack","description":"Custom design helpers"}');
    fs.writeFileSync(path.join(sourceDir, 'skill.json'), '{"entrypoint":"main.py","version":"v3.1.0"}');
    fs.writeFileSync(path.join(sourceDir, 'skills', 'designer-demo', 'SKILL.md'), '# Subskill');

    importMarketplaceSkillGroupFromDir(
      sourceDir,
      'designer-pack',
      path.join(tempDir, 'skills'),
      getCustomMarketplaceSource('https://github.com/example/custom-repo'),
    );

    expect(getMarketplaceImportMetadata('designer-pack')).toEqual({
      slug: 'designer-pack',
      version: 'v3.1.0',
      importedAt: expect.any(String),
      sourceId: 'my-skills',
      sourceLabel: 'My SKILLS',
      repoUrl: 'https://github.com/example/custom-repo',
    });
  });
});