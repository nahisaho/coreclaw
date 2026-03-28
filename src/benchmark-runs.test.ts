import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
  buildBenchmarkArtifactCheck,
  buildBenchmarkEvaluationResult,
  loadBenchmarkDefinitions,
  matchBenchmarkDefinition,
  parseBenchmarkDefinitionsJson,
  parseBenchmarkPromptsMarkdown,
} from './benchmark-runs.js';

describe('benchmark run helpers', () => {
  it('parses benchmark definitions and required artifacts from markdown', () => {
    const markdown = [
      '### プロンプト 1: テスト仮説',
      '',
      '```',
      'あなたは新物質探索型の仮説発見AIです。',
      'テスト入力です。',
      '```',
      '',
      '## 出力',
      '- `results/example.json` — 結果',
      '- **`report.md`** — 総合レポート',
      '',
      '### プロンプト 2: 別テスト',
      '',
      '```',
      '別の入力',
      '```',
      '',
      '## 出力',
      '- `docs/another.md` — 説明',
    ].join('\n');

    const definitions = parseBenchmarkPromptsMarkdown(markdown);
    expect(definitions).toHaveLength(2);
    expect(definitions[0]).toMatchObject({
      id: 'benchmark-prompt-1',
      title: 'テスト仮説',
      requiredArtifacts: ['results/example.json', 'report.md'],
    });
    expect(matchBenchmarkDefinition('あなたは新物質探索型の仮説発見AIです。\nテスト入力です。', definitions)?.id).toBe('benchmark-prompt-1');
  });

  it('builds artifact coverage and evaluation result', () => {
    const artifactCheck = buildBenchmarkArtifactCheck(
      'run-1',
      ['report.md', 'results/example.json'],
      ['report.md'],
      (relativePath) => (relativePath === 'report.md' ? 1024 : 0),
    );

    expect(artifactCheck).toEqual({
      runId: 'run-1',
      requiredArtifacts: ['report.md', 'results/example.json'],
      checks: [
        { path: 'report.md', exists: true, sizeBytes: 1024 },
        { path: 'results/example.json', exists: false, sizeBytes: 0 },
      ],
      artifactCoverage: 0.5,
      allRequiredPresent: false,
    });

    expect(buildBenchmarkEvaluationResult('run-1', 'done', artifactCheck, 'final answer')).toMatchObject({
      runId: 'run-1',
      result: 'fail',
      reasons: ['missing_required_artifacts'],
      scores: {
        artifactCoverage: 0.5,
        finalResponsePresent: 1,
        taskEndedWithoutError: 1,
      },
    });
  });

  it('loads machine-readable benchmark definitions before markdown fallback', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coreclaw-benchmark-'));
    const jsonPath = path.join(tempDir, 'benchmark-prompts.json');
    const markdownPath = path.join(tempDir, 'benchmark-prompts.md');

    fs.writeFileSync(jsonPath, JSON.stringify({
      benchmarks: [{
        id: 'benchmark-json-1',
        title: 'JSON prompt',
        label: 'json-prompt',
        promptText: 'json prompt body',
        requiredArtifacts: ['report.md'],
      }],
    }, null, 2));
    fs.writeFileSync(markdownPath, ['### プロンプト 1: Markdown prompt', '', '```', 'markdown prompt body', '```'].join('\n'));

    const parsedJson = parseBenchmarkDefinitionsJson(fs.readFileSync(jsonPath, 'utf-8'), jsonPath);
    expect(parsedJson[0]).toMatchObject({
      id: 'benchmark-json-1',
      promptSource: jsonPath,
      requiredArtifacts: ['report.md'],
    });

    const definitions = loadBenchmarkDefinitions([jsonPath, markdownPath]);
    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toMatchObject({
      id: 'benchmark-json-1',
      promptSource: jsonPath,
    });
    expect(matchBenchmarkDefinition('json prompt body', definitions)?.id).toBe('benchmark-json-1');

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});