import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getMarketplaceImportMetadata,
  getSkillMetadata,
  importMarketplaceSkillGroupFromDir,
  isMarketplaceImportedSkill,
  listMarketplaceSkillGroups,
} from './skills-sync.js';

describe('skills-sync marketplace helpers', () => {
  const originalCwd = process.cwd();
  let tempDir = '';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coreclaw-skills-test-'));
    process.chdir(tempDir);
    fs.mkdirSync(path.join(tempDir, 'skills'), { recursive: true });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('lists marketplace skill groups with installed status and metadata', async () => {
    fs.mkdirSync(path.join(tempDir, 'skills', 'scientist'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'skills', 'scientist', 'SKILL.md'), '# local');

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
      },
      {
        slug: 'scientist',
        name: 'Scientist',
        description: 'Research pack',
        icon: '🔬',
        version: 'v1.2.3',
        count: 196,
        installed: true,
      },
    ]);
  });

  it('imports a marketplace skill package from a source directory', () => {
    const sourceDir = path.join(tempDir, 'marketplace', 'scientist');
    fs.mkdirSync(path.join(sourceDir, 'scientific-demo'), { recursive: true });
    fs.mkdirSync(path.join(sourceDir, 'source'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '## Verification Loop (v0.2.0)');
    fs.writeFileSync(path.join(sourceDir, 'group.json'), '{"name":"Scientist"}');
    fs.writeFileSync(path.join(sourceDir, 'README.md'), 'package readme');
    fs.writeFileSync(path.join(sourceDir, 'main.py'), 'print("wrapper")');
    fs.writeFileSync(path.join(sourceDir, 'skill.json'), '{"entrypoint":"main.py","version":"v0.2.0"}');
    fs.writeFileSync(path.join(sourceDir, 'source', 'SKILL.md'), '# Package source');
    fs.writeFileSync(path.join(sourceDir, 'scientific-demo', 'SKILL.md'), '# Subskill');

    const imported = importMarketplaceSkillGroupFromDir(sourceDir, 'scientist');
    expect(imported.updated).toBe(false);
    expect(imported.fileCount).toBe(3);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'group.json'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'scientific-demo', 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'README.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'main.py'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'skill.json'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'source'))).toBe(false);
    expect(getMarketplaceImportMetadata('scientist')).toEqual({
      slug: 'scientist',
      version: 'v0.2.0',
      importedAt: expect.any(String),
    });
    expect(isMarketplaceImportedSkill('scientist')).toBe(true);
    expect(getSkillMetadata('scientist')).toEqual({
      name: 'scientist',
      description: '',
      version: 'v0.2.0',
    });

    fs.mkdirSync(path.join(tempDir, 'skills', 'scientist', 'prompts'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'skills', 'scientist', 'prompts', 'local.md'), 'keep me');

    fs.writeFileSync(path.join(sourceDir, 'scientific-demo', 'README.md'), 'updated');
    const updated = importMarketplaceSkillGroupFromDir(sourceDir, 'scientist');
    expect(updated.updated).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'scientific-demo', 'README.md'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'skills', 'scientist', 'prompts', 'local.md'))).toBe(true);
  });
});