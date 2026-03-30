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

const OFFICIAL_MARKETPLACE_REPO_URL = 'https://github.com/nahisaho/coreclaw-marketplace';
const OFFICIAL_MARKETPLACE_SKILLS_PATH = 'coreclaw-skills-hub/skills';
const MARKETPLACE_IMPORT_METADATA_FILE = '.coreclaw-marketplace.json';
export const OFFICIAL_MARKETPLACE_SOURCE_ID = 'official';
export const MY_SKILLS_SOURCE_ID = 'my-skills';

export interface MarketplaceSourceConfig {
  id: string;
  label: string;
  repoUrl: string;
  skillsPath: string;
}

export interface MarketplaceSkillGroup {
  slug: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  count: number;
  installed: boolean;
  sourceId: string;
  sourceLabel: string;
  repoUrl: string;
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

interface MarketplaceSkillMetadata {
  version?: string;
}

export interface MarketplaceImportMetadata {
  slug: string;
  version: string;
  importedAt: string;
  sourceId: string;
  sourceLabel: string;
  repoUrl: string;
}

function getOfficialMarketplaceSource(): MarketplaceSourceConfig {
  return {
    id: OFFICIAL_MARKETPLACE_SOURCE_ID,
    label: 'Marketplace',
    repoUrl: OFFICIAL_MARKETPLACE_REPO_URL,
    skillsPath: OFFICIAL_MARKETPLACE_SKILLS_PATH,
  };
}

function normalizeGithubRepoUrl(repoUrl: string): string {
  const trimmed = String(repoUrl || '').trim();
  if (!trimmed) {
    throw new Error('GitHub repository URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid GitHub repository URL');
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') {
    throw new Error('GitHub repository URL must use github.com');
  }

  const parts = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error('GitHub repository URL must include owner and repository name');
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!owner || !repo) {
    throw new Error('GitHub repository URL must include owner and repository name');
  }

  return `https://github.com/${owner}/${repo}`;
}

function getGithubContentsApiBase(repoUrl: string): string {
  const normalizedUrl = normalizeGithubRepoUrl(repoUrl);
  const [, , , owner, repo] = normalizedUrl.split('/');
  return `https://api.github.com/repos/${owner}/${repo}/contents`;
}

function getGithubCloneUrl(repoUrl: string): string {
  return `${normalizeGithubRepoUrl(repoUrl)}.git`;
}

export function getCustomMarketplaceSource(repoUrl: string): MarketplaceSourceConfig {
  return {
    id: MY_SKILLS_SOURCE_ID,
    label: 'My SKILLS',
    repoUrl: normalizeGithubRepoUrl(repoUrl),
    skillsPath: 'skills',
  };
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

function getMarketplaceImportMetadataPath(skillDir: string): string {
  return path.join(skillDir, MARKETPLACE_IMPORT_METADATA_FILE);
}

function getNestedSkillsRoot(skillDir: string): string {
  return path.join(skillDir, 'skills');
}

function listNestedSkillDefinitionPaths(skillDir: string): string[] {
  const nestedSkillsRoot = getNestedSkillsRoot(skillDir);
  if (!fs.existsSync(nestedSkillsRoot) || !fs.statSync(nestedSkillsRoot).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(nestedSkillsRoot)
    .map((entry) => path.join(nestedSkillsRoot, entry, 'SKILL.md'))
    .filter((skillPath) => fs.existsSync(skillPath))
    .sort();
}

function findCanonicalSkillFile(skillDir: string): string | null {
  const rootSkillPath = path.join(skillDir, 'SKILL.md');
  if (fs.existsSync(rootSkillPath)) {
    return rootSkillPath;
  }

  return listNestedSkillDefinitionPaths(skillDir)[0] || null;
}

function isInstallableSkillPackage(skillDir: string): boolean {
  return findCanonicalSkillFile(skillDir) !== null;
}

function readMarketplaceGroupMetadata(sourceDir: string): MarketplaceGroupMetadata {
  const groupJsonPath = path.join(sourceDir, 'group.json');
  if (!fs.existsSync(groupJsonPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(groupJsonPath, 'utf-8')) as MarketplaceGroupMetadata;
  } catch {
    return {};
  }
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
    if (entry.name === MARKETPLACE_IMPORT_METADATA_FILE) continue;
    const entryPath = path.join(dir, entry.name);
    count += entry.isDirectory() ? countFilesRecursive(entryPath) : 1;
  }
  return count;
}

function readMarketplaceSkillVersion(sourceDir: string): string {
  const skillJsonPath = path.join(sourceDir, 'skill.json');
  if (!fs.existsSync(skillJsonPath)) return '';

  try {
    const raw = JSON.parse(fs.readFileSync(skillJsonPath, 'utf-8')) as MarketplaceSkillMetadata;
    return typeof raw.version === 'string' ? raw.version.trim() : '';
  } catch {
    return '';
  }
}

function extractSkillVersion(content: string): string {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const versionMatch = frontmatterMatch[1].match(/^version:\s*(.+)$/m);
    if (versionMatch) {
      return versionMatch[1].trim();
    }
  }

  const inlineVersionMatch = content.match(/\bv\d+\.\d+\.\d+\b/);
  return inlineVersionMatch ? inlineVersionMatch[0].trim() : '';
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

async function fetchMarketplaceFileJson<T>(url: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'CoreClaw',
    },
  });
  if (!res.ok) {
    throw new Error(`Marketplace request failed: ${res.status}`);
  }

  const payload = await res.json() as { content?: string; encoding?: string };
  if (typeof payload.content !== 'string') {
    return payload as T;
  }

  const decoded = payload.encoding === 'base64'
    ? Buffer.from(payload.content, 'base64').toString('utf-8')
    : payload.content;
  return JSON.parse(decoded) as T;
}

async function listMarketplaceSkillGroupsFromSource(
  source: MarketplaceSourceConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<MarketplaceSkillGroup[]> {
  const rootEntries = await fetchMarketplaceJson<MarketplaceDirEntry[]>(
    `${getGithubContentsApiBase(source.repoUrl)}/${source.skillsPath}`,
    fetchImpl,
  );
  const skillGroups = rootEntries.filter((entry) => entry.type === 'dir');
  const skillsRoot = getSkillsRoot();

  const groups = await Promise.all(skillGroups.map(async (entry) => {
    let meta: MarketplaceGroupMetadata = {};
    let skillMeta: MarketplaceSkillMetadata = {};
    try {
      meta = await fetchMarketplaceFileJson<MarketplaceGroupMetadata>(
        `${getGithubContentsApiBase(source.repoUrl)}/${source.skillsPath}/${entry.name}/group.json`,
        fetchImpl,
      );
    } catch (err) {
      logger.warn({ group: entry.name, source: source.id, err }, 'Failed to read marketplace group.json');
    }

    try {
      skillMeta = await fetchMarketplaceFileJson<MarketplaceSkillMetadata>(
        `${getGithubContentsApiBase(source.repoUrl)}/${source.skillsPath}/${entry.name}/skill.json`,
        fetchImpl,
      );
    } catch (err) {
      logger.warn({ group: entry.name, source: source.id, err }, 'Failed to read marketplace skill.json');
    }

    return {
      slug: entry.name,
      name: meta.name?.trim() || entry.name,
      description: meta.description?.trim() || '',
      icon: meta.icon?.trim() || '📦',
      version: skillMeta.version?.trim() || '',
      count: Number.isFinite(meta.count) ? Number(meta.count) : 0,
      installed: isInstallableSkillPackage(path.join(skillsRoot, entry.name)),
      sourceId: source.id,
      sourceLabel: source.label,
      repoUrl: source.repoUrl,
    } satisfies MarketplaceSkillGroup;
  }));

  return groups.sort((left, right) => left.slug.localeCompare(right.slug));
}

export async function listMarketplaceSkillGroups(
  sourceOrFetch: MarketplaceSourceConfig | typeof fetch = getOfficialMarketplaceSource(),
  fetchImpl: typeof fetch = fetch,
): Promise<MarketplaceSkillGroup[]> {
  if (typeof sourceOrFetch === 'function') {
    return listMarketplaceSkillGroupsFromSource(getOfficialMarketplaceSource(), sourceOrFetch);
  }

  return listMarketplaceSkillGroupsFromSource(sourceOrFetch, fetchImpl);
}

export function importMarketplaceSkillGroupFromDir(
  sourceDir: string,
  groupName: string,
  skillsRoot = getSkillsRoot(),
  source = getOfficialMarketplaceSource(),
): { name: string; updated: boolean; fileCount: number } {
  const safeGroupName = sanitizeSkillName(groupName);
  if (!safeGroupName) {
    throw new Error('Invalid marketplace skill name');
  }
  if (!isInstallableSkillPackage(sourceDir)) {
    throw new Error('Marketplace skill package is missing SKILL.md');
  }

  const destinationDir = path.join(skillsRoot, safeGroupName);
  const updated = fs.existsSync(destinationDir);
  const marketplaceVersion = readMarketplaceSkillVersion(sourceDir);
  fs.mkdirSync(destinationDir, { recursive: true });
  copyMarketplaceDirSync(sourceDir, destinationDir);

  const metadata: MarketplaceImportMetadata = {
    slug: safeGroupName,
    version: marketplaceVersion,
    importedAt: new Date().toISOString(),
    sourceId: source.id,
    sourceLabel: source.label,
    repoUrl: source.repoUrl,
  };
  fs.writeFileSync(
    getMarketplaceImportMetadataPath(destinationDir),
    JSON.stringify(metadata, null, 2),
  );

  return {
    name: safeGroupName,
    updated,
    fileCount: countFilesRecursive(destinationDir),
  };
}

export function importMarketplaceSkillGroup(
  groupName: string,
  source = getOfficialMarketplaceSource(),
): { name: string; updated: boolean; fileCount: number } {
  const safeGroupName = sanitizeSkillName(groupName);
  if (!safeGroupName) {
    throw new Error('Invalid marketplace skill name');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coreclaw-marketplace-'));
  const repoDir = path.join(tempDir, 'repo');

  try {
    const clone = spawnSync('git', ['clone', '--depth', '1', getGithubCloneUrl(source.repoUrl), repoDir], {
      encoding: 'utf-8',
      timeout: 120000,
    });
    if (clone.status !== 0) {
      throw new Error((clone.stderr || clone.stdout || 'Failed to clone marketplace repository').trim());
    }

    const sourceDir = path.join(repoDir, source.skillsPath, safeGroupName);
    if (!fs.existsSync(sourceDir)) {
      throw new Error('Marketplace skill package not found');
    }

    return importMarketplaceSkillGroupFromDir(sourceDir, safeGroupName, getSkillsRoot(), source);
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
      if (!isInstallableSkillPackage(srcDir)) continue;
      const dstDir = path.join(groupSkillsDir, skillDir);
      const srcSkillMd = path.join(srcDir, 'SKILL.md');
      if (!fs.existsSync(srcSkillMd)) {
        copyDirSync(srcDir, dstDir);
        synced++;
        continue;
      }
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
      return fs.statSync(entryPath).isDirectory() && isInstallableSkillPackage(entryPath);
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

  const skillDir = path.join(localSkillsPath, skillName);
  const skillMdPath = findCanonicalSkillFile(skillDir);
  if (!skillMdPath) return null;

  const content = fs.readFileSync(skillMdPath, 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);

  const marketplaceMeta = getMarketplaceImportMetadata(skillName);
  const skillPackageVersion = readMarketplaceSkillVersion(skillDir);
  const groupMeta = readMarketplaceGroupMetadata(skillDir);
  if (!match) {
    return {
      name: groupMeta.name?.trim() || skillName,
      description: groupMeta.description?.trim() || '',
      version: extractSkillVersion(content) || skillPackageVersion || marketplaceMeta?.version || '',
    };
  }

  const frontmatter = match[1];
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*\|?\s*\n?([\s\S]*?)$/m);

  return {
    name: groupMeta.name?.trim() || (nameMatch ? nameMatch[1].trim() : skillName),
    description: descMatch
      ? descMatch[1].trim().replace(/\n\s*/g, ' ')
      : (groupMeta.description?.trim() || ''),
    version: extractSkillVersion(content) || skillPackageVersion || marketplaceMeta?.version || '',
  };
}

export function getMarketplaceImportMetadata(
  skillName: string,
  skillsRoot = getSkillsRoot(),
): MarketplaceImportMetadata | null {
  const officialSource = getOfficialMarketplaceSource();
  const metadataPath = getMarketplaceImportMetadataPath(path.join(skillsRoot, skillName));
  if (!fs.existsSync(metadataPath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as Partial<MarketplaceImportMetadata>;
    if (typeof parsed.slug !== 'string' || !parsed.slug.trim()) return null;
    return {
      slug: parsed.slug.trim(),
      version: typeof parsed.version === 'string' ? parsed.version.trim() : '',
      importedAt: typeof parsed.importedAt === 'string' ? parsed.importedAt : '',
      sourceId: typeof parsed.sourceId === 'string' && parsed.sourceId.trim()
        ? parsed.sourceId.trim()
        : officialSource.id,
      sourceLabel: typeof parsed.sourceLabel === 'string' && parsed.sourceLabel.trim()
        ? parsed.sourceLabel.trim()
        : officialSource.label,
      repoUrl: typeof parsed.repoUrl === 'string' && parsed.repoUrl.trim()
        ? normalizeGithubRepoUrl(parsed.repoUrl)
        : officialSource.repoUrl,
    };
  } catch {
    return null;
  }
}

export function isMarketplaceImportedSkill(
  skillName: string,
  skillsRoot = getSkillsRoot(),
): boolean {
  if (getMarketplaceImportMetadata(skillName, skillsRoot)) return true;
  const skillDir = path.join(skillsRoot, skillName);
  return fs.existsSync(path.join(skillDir, 'group.json')) && isInstallableSkillPackage(skillDir);
}
