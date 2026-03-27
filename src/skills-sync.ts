/**
 * Skills synchronization for CoreClaw.
 * Copies Agent Skills from the local skills/ directory
 * into per-group .github/skills/ directories so containers can use them.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

import { logger } from './logger.js';

const MARKETPLACE_REPO_URL = 'https://github.com/nahisaho/coreclaw-marketplace.git';
const MARKETPLACE_API_BASE = 'https://api.github.com/repos/nahisaho/coreclaw-marketplace/contents';
const MARKETPLACE_RAW_BASE = 'https://raw.githubusercontent.com/nahisaho/coreclaw-marketplace/main';
const MARKETPLACE_SKILLS_PATH = 'coreclaw-skills-hub/skills';

export interface MarketplaceSkillGroup {
  slug: string;
  name: string;
  description: string;
  icon: string;
  count: number;
  installed: boolean;
}

interface MarketplaceDirEntry {
  name: string;
  type: string;
}

interface MarketplaceGroupMetadata {
  name?: string;
  description?: string;
  icon?: string;
  count?: number;
}

/**
 * Resolve the path to the local skills directory.
 */
function getLocalSkillsPath(): string | null {
  const skillsDir = path.resolve(process.cwd(), 'skills');
  if (fs.existsSync(skillsDir)) {
    return skillsDir;
  }
  return null;
}

function getSkillsRoot(): string {
  return path.resolve(process.cwd(), 'skills');
}

/**
 * Copy a directory recursively.
 */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyMarketplaceDirSync(src: string, dest: string, isRoot = true): void {
  fs.mkdirSync(dest, { recursive: true });
  const ignoredRootEntries = new Set(['README.md', 'main.py', 'skill.json', 'source']);

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (isRoot && ignoredRootEntries.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyMarketplaceDirSync(srcPath, destPath, false);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function countFilesRecursive(dir: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    count += entry.isDirectory() ? countFilesRecursive(entryPath) : 1;
  }
  return count;
}

function sanitizeSkillName(skillName: string): string {
  return skillName.trim().replace(/[^a-zA-Z0-9_-]/g, '');
}

async function fetchMarketplaceJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CoreClaw',
    },
  });
  if (!res.ok) {
    throw new Error(`Marketplace request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listMarketplaceSkillGroups(fetchImpl: typeof fetch = fetch): Promise<MarketplaceSkillGroup[]> {
  const rootEntries = await fetchMarketplaceJson<MarketplaceDirEntry[]>(
    `${MARKETPLACE_API_BASE}/${MARKETPLACE_SKILLS_PATH}`,
    fetchImpl,
  );
  const skillGroups = rootEntries.filter((entry) => entry.type === 'dir');
  const skillsRoot = getSkillsRoot();

  const groups = await Promise.all(skillGroups.map(async (entry) => {
    let meta: MarketplaceGroupMetadata = {};
    try {
      meta = await fetchMarketplaceJson<MarketplaceGroupMetadata>(
        `${MARKETPLACE_RAW_BASE}/${MARKETPLACE_SKILLS_PATH}/${entry.name}/group.json`,
        fetchImpl,
      );
    } catch (err) {
      logger.warn({ group: entry.name, err }, 'Failed to read marketplace group.json');
    }

    return {
      slug: entry.name,
      name: meta.name?.trim() || entry.name,
      description: meta.description?.trim() || '',
      icon: meta.icon?.trim() || '📦',
      count: Number.isFinite(meta.count) ? Number(meta.count) : 0,
      installed: fs.existsSync(path.join(skillsRoot, entry.name, 'SKILL.md')),
    } satisfies MarketplaceSkillGroup;
  }));

  return groups.sort((left, right) => left.slug.localeCompare(right.slug));
}

export function importMarketplaceSkillGroupFromDir(
  sourceDir: string,
  groupName: string,
  skillsRoot = getSkillsRoot(),
): { name: string; updated: boolean; fileCount: number } {
  const safeGroupName = sanitizeSkillName(groupName);
  if (!safeGroupName) {
    throw new Error('Invalid marketplace skill name');
  }
  if (!fs.existsSync(path.join(sourceDir, 'SKILL.md'))) {
    throw new Error('Marketplace skill package is missing SKILL.md');
  }

  const destinationDir = path.join(skillsRoot, safeGroupName);
  const updated = fs.existsSync(destinationDir);
  fs.mkdirSync(destinationDir, { recursive: true });
  copyMarketplaceDirSync(sourceDir, destinationDir);

  return {
    name: safeGroupName,
    updated,
    fileCount: countFilesRecursive(destinationDir),
  };
}

export function importMarketplaceSkillGroup(groupName: string): { name: string; updated: boolean; fileCount: number } {
  const safeGroupName = sanitizeSkillName(groupName);
  if (!safeGroupName) {
    throw new Error('Invalid marketplace skill name');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coreclaw-marketplace-'));
  const repoDir = path.join(tempDir, 'repo');

  try {
    const clone = spawnSync('git', ['clone', '--depth', '1', MARKETPLACE_REPO_URL, repoDir], {
      encoding: 'utf-8',
      timeout: 120000,
    });
    if (clone.status !== 0) {
      throw new Error((clone.stderr || clone.stdout || 'Failed to clone marketplace repository').trim());
    }

    const sourceDir = path.join(repoDir, MARKETPLACE_SKILLS_PATH, safeGroupName);
    if (!fs.existsSync(sourceDir)) {
      throw new Error('Marketplace skill package not found');
    }

    return importMarketplaceSkillGroupFromDir(sourceDir, safeGroupName);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * Sync skills into a group's .github/skills/ directory.
 *
 * Sources (in order, later overrides earlier):
 *   1. Local skills/ directory (project root)
 *   2. Custom skills from container/skills/ directory
 *
 * @param groupSkillsDir - Destination: data/sessions/{group}/.github/skills/
 * @param projectRoot - The project root directory
 */
export function syncSkillsToGroup(
  groupSkillsDir: string,
  projectRoot: string,
  skillFilter?: string,
): void {
  fs.mkdirSync(groupSkillsDir, { recursive: true });

  // Parse skill filter: supports comma-separated list of skill names
  const filterSet = skillFilter
    ? new Set(skillFilter.split(',').map(s => s.trim()).filter(Boolean))
    : null;

  // 1. Sync skills from local skills/ directory
  const localSkillsPath = getLocalSkillsPath();
  if (localSkillsPath) {
    let synced = 0;
    for (const skillDir of fs.readdirSync(localSkillsPath)) {
      // If a skill filter is set, only sync matching skills
      if (filterSet && !filterSet.has(skillDir)) continue;
      const srcDir = path.join(localSkillsPath, skillDir);
      if (!fs.statSync(srcDir).isDirectory()) continue;
      const dstDir = path.join(groupSkillsDir, skillDir);
      const srcSkillMd = path.join(srcDir, 'SKILL.md');
      if (!fs.existsSync(srcSkillMd)) continue;
      const dstSkillMd = path.join(dstDir, 'SKILL.md');
      if (
        !fs.existsSync(dstSkillMd) ||
        fs.statSync(srcSkillMd).mtimeMs > fs.statSync(dstSkillMd).mtimeMs
      ) {
        copyDirSync(srcDir, dstDir);
        synced++;
      }
    }
    if (synced > 0) {
      logger.debug({ count: synced, filter: skillFilter || 'all' }, 'Synced local skills to group');
    }
  }

  // 2. Sync custom project skills from container/skills/ (overrides local)
  const customSkillsDir = path.join(projectRoot, 'container', 'skills');
  if (fs.existsSync(customSkillsDir)) {
    for (const skillDir of fs.readdirSync(customSkillsDir)) {
      const srcDir = path.join(customSkillsDir, skillDir);
      if (!fs.statSync(srcDir).isDirectory()) continue;
      const dstDir = path.join(groupSkillsDir, skillDir);
      copyDirSync(srcDir, dstDir);
    }
    logger.debug('Synced custom project skills to group');
  }
}

/**
 * Get list of available skill names.
 */
export function listAvailableSkills(): string[] {
  const localSkillsPath = getLocalSkillsPath();
  if (!localSkillsPath) return [];

  return fs
    .readdirSync(localSkillsPath)
    .filter((entry) => {
      const entryPath = path.join(localSkillsPath, entry);
      return (
        fs.statSync(entryPath).isDirectory() &&
        fs.existsSync(path.join(entryPath, 'SKILL.md'))
      );
    })
    .sort();
}

/**
 * Get skill metadata (name, description, and version from YAML frontmatter).
 */
export function getSkillMetadata(
  skillName: string,
): { name: string; description: string; version: string } | null {
  const localSkillsPath = getLocalSkillsPath();
  if (!localSkillsPath) return null;

  const skillMdPath = path.join(localSkillsPath, skillName, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;

  const content = fs.readFileSync(skillMdPath, 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*\|?\s*\n?([\s\S]*?)$/m);
  const versionMatch = frontmatter.match(/^version:\s*(.+)$/m);

  return {
    name: nameMatch ? nameMatch[1].trim() : skillName,
    description: descMatch
      ? descMatch[1].trim().replace(/\n\s*/g, ' ')
      : '',
    version: versionMatch ? versionMatch[1].trim() : '',
  };
}
