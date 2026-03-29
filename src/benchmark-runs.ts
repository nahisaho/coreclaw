import fs from 'fs';
import path from 'path';

export interface BenchmarkDefinition {
  id: string;
  label: string;
  title: string;
  promptText: string;
  requiredArtifacts: string[];
  promptSource: string;
}

export interface BenchmarkArtifactCheckItem {
  path: string;
  exists: boolean;
  sizeBytes: number;
}

export interface BenchmarkArtifactCheck {
  runId: string;
  requiredArtifacts: string[];
  checks: BenchmarkArtifactCheckItem[];
  artifactCoverage: number;
  allRequiredPresent: boolean;
}

export interface BenchmarkEvaluationResult {
  runId: string;
  result: 'pass' | 'fail';
  reasons: string[];
  scores: {
    artifactCoverage: number;
    finalResponsePresent: number;
    taskEndedWithoutError: number;
  };
  summary: string;
}

interface BenchmarkManifestEntry {
  id?: unknown;
  label?: unknown;
  title?: unknown;
  promptText?: unknown;
  requiredArtifacts?: unknown;
}

interface BenchmarkManifestFile {
  benchmarks?: unknown;
}

const DEFAULT_BENCHMARK_JSON_PATH = path.resolve(process.cwd(), 'tests', 'benchmark-prompts.json');
const DEFAULT_BENCHMARK_MARKDOWN_PATH = path.resolve(process.cwd(), 'tests', 'benchmark-prompts.md');

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function normalizePromptText(text: string): string {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

export function parseBenchmarkPromptsMarkdown(markdown: string): BenchmarkDefinition[] {
  return parseBenchmarkPromptsMarkdownFile(markdown, DEFAULT_BENCHMARK_MARKDOWN_PATH);
}

export function parseBenchmarkPromptsMarkdownFile(markdown: string, promptSource: string): BenchmarkDefinition[] {
  const source = String(markdown || '').replace(/\r\n/g, '\n');
  const headingRegex = /^###\s+プロンプト\s+(\d+):\s+(.+)$/gm;
  const matches = Array.from(source.matchAll(headingRegex));
  const definitions: BenchmarkDefinition[] = [];

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const promptNumber = match[1];
    const title = match[2].trim();
    const sectionStart = match.index ?? 0;
    const sectionEnd = index + 1 < matches.length
      ? matches[index + 1].index ?? source.length
      : source.length;
    const section = source.slice(sectionStart, sectionEnd);

    const codeBlockMatch = section.match(/```\n([\s\S]*?)\n```/);
    if (!codeBlockMatch) continue;

    const outputHeaderIndex = section.indexOf('## 出力');
    const outputSection = outputHeaderIndex >= 0 ? section.slice(outputHeaderIndex) : '';
    const requiredArtifacts = Array.from(
      outputSection.matchAll(/^\-\s+(?:\*\*)?`([^`]+)`(?:\*\*)?/gm),
      (artifactMatch) => artifactMatch[1].trim(),
    );

    definitions.push({
      id: `benchmark-prompt-${promptNumber}`,
      label: `prompt-${promptNumber}-${slugify(title)}`,
      title,
      promptText: normalizePromptText(codeBlockMatch[1]),
      requiredArtifacts: [...new Set(requiredArtifacts)],
      promptSource,
    });
  }

  return definitions;
}

function normalizeBenchmarkDefinition(
  entry: BenchmarkManifestEntry,
  index: number,
  promptSource: string,
): BenchmarkDefinition | null {
  const promptText = normalizePromptText(typeof entry.promptText === 'string' ? entry.promptText : '');
  if (!promptText) return null;

  const rawTitle = typeof entry.title === 'string' ? entry.title.trim() : '';
  const rawId = typeof entry.id === 'string' ? entry.id.trim() : '';
  const title = rawTitle || rawId || `benchmark-${index + 1}`;
  const id = rawId || `benchmark-${index + 1}`;
  const label = typeof entry.label === 'string' && entry.label.trim()
    ? entry.label.trim()
    : slugify(title) || id;
  const requiredArtifacts = Array.isArray(entry.requiredArtifacts)
    ? entry.requiredArtifacts.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  return {
    id,
    label,
    title,
    promptText,
    requiredArtifacts: [...new Set(requiredArtifacts)],
    promptSource,
  };
}

export function parseBenchmarkDefinitionsJson(jsonText: string, promptSource = DEFAULT_BENCHMARK_JSON_PATH): BenchmarkDefinition[] {
  const parsed = JSON.parse(String(jsonText || '')) as BenchmarkManifestFile | BenchmarkManifestEntry[];
  const entries = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.benchmarks)
      ? parsed.benchmarks
      : [];

  return entries
    .map((entry, index) => normalizeBenchmarkDefinition(entry as BenchmarkManifestEntry, index, promptSource))
    .filter((entry): entry is BenchmarkDefinition => entry !== null);
}

export function loadBenchmarkDefinitions(
  benchmarkFilePath: string | string[] = [DEFAULT_BENCHMARK_JSON_PATH, DEFAULT_BENCHMARK_MARKDOWN_PATH],
): BenchmarkDefinition[] {
  const candidatePaths = Array.isArray(benchmarkFilePath) ? benchmarkFilePath : [benchmarkFilePath];
  for (const candidatePath of candidatePaths) {
    try {
      if (!fs.existsSync(candidatePath)) continue;
      const fileContents = fs.readFileSync(candidatePath, 'utf-8');
      if (candidatePath.endsWith('.json')) {
        const definitions = parseBenchmarkDefinitionsJson(fileContents, candidatePath);
        if (definitions.length > 0) return definitions;
        continue;
      }
      const definitions = parseBenchmarkPromptsMarkdownFile(fileContents, candidatePath);
      if (definitions.length > 0) return definitions;
    } catch {
      continue;
    }
  }
  return [];
}

export function getBenchmarkDefinitionById(
  benchmarkId: string,
  definitions: BenchmarkDefinition[] = loadBenchmarkDefinitions(),
): BenchmarkDefinition | null {
  const normalizedId = String(benchmarkId || '').trim();
  if (!normalizedId) return null;

  for (const definition of definitions) {
    if (definition.id === normalizedId || definition.label === normalizedId) {
      return definition;
    }
  }

  return null;
}

export function matchBenchmarkDefinition(
  promptText: string,
  definitions: BenchmarkDefinition[] = loadBenchmarkDefinitions(),
): BenchmarkDefinition | null {
  const normalizedPrompt = normalizePromptText(promptText);
  if (!normalizedPrompt) return null;

  for (const definition of definitions) {
    if (normalizedPrompt === definition.promptText) {
      return definition;
    }
  }

  return null;
}

export function buildBenchmarkArtifactCheck(
  runId: string,
  requiredArtifacts: string[],
  existingArtifacts: string[],
  getArtifactSizeBytes: (relativePath: string) => number,
): BenchmarkArtifactCheck {
  const normalizedExisting = new Set(existingArtifacts.map((artifact) => artifact.replace(/^\.\//, '')));
  const checks = requiredArtifacts.map((requiredArtifact) => {
    const normalized = requiredArtifact.replace(/^\.\//, '');
    const exists = normalizedExisting.has(normalized);
    return {
      path: normalized,
      exists,
      sizeBytes: exists ? getArtifactSizeBytes(normalized) : 0,
    };
  });

  const presentCount = checks.filter((item) => item.exists).length;
  return {
    runId,
    requiredArtifacts: [...requiredArtifacts],
    checks,
    artifactCoverage: checks.length > 0 ? presentCount / checks.length : 1,
    allRequiredPresent: checks.every((item) => item.exists),
  };
}

export function buildBenchmarkEvaluationResult(
  runId: string,
  taskStatus: 'done' | 'error' | 'cancelled',
  artifactCheck: BenchmarkArtifactCheck,
  finalResponse: string,
): BenchmarkEvaluationResult {
  const trimmedResponse = String(finalResponse || '').trim();
  const finalResponsePresent = trimmedResponse ? 1 : 0;
  const taskEndedWithoutError = taskStatus === 'done' ? 1 : 0;
  const reasons: string[] = [];

  if (taskStatus !== 'done') {
    reasons.push(taskStatus === 'cancelled' ? 'task_cancelled' : 'task_completed_with_error');
  }
  if (!artifactCheck.allRequiredPresent) {
    reasons.push('missing_required_artifacts');
  }
  if (!finalResponsePresent) {
    reasons.push('final_response_missing');
  }

  const result = reasons.length === 0 ? 'pass' : 'fail';
  const missingArtifacts = artifactCheck.checks.filter((item) => !item.exists).length;

  return {
    runId,
    result,
    reasons,
    scores: {
      artifactCoverage: artifactCheck.artifactCoverage,
      finalResponsePresent,
      taskEndedWithoutError,
    },
    summary: [
      result === 'pass'
        ? 'All required artifacts were generated and the task completed successfully.'
        : `${missingArtifacts} required artifacts were missing or the task did not complete cleanly.`,
      `artifact coverage=${artifactCheck.artifactCoverage.toFixed(2)}`,
      `task status=${taskStatus}`,
    ].join(' '),
  };
}