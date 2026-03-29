import fs from 'fs';
import path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { getArtifactsDir, listArtifactEntries, listArtifacts } from './experiments.js';

describe('artifact listing helpers', () => {
  const createdPaths: string[] = [];

  afterEach(() => {
    for (const target of createdPaths.splice(0).reverse()) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });

  it('returns files and empty directories for artifact trees while preserving file-only listArtifacts', () => {
    const experimentId = `artifact-tree-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const artifactsDir = getArtifactsDir(experimentId);
    const workspaceDir = path.join(process.cwd(), 'groups', `experiment-${experimentId}`);
    const experimentDataDir = path.join(process.cwd(), 'data', 'experiments', experimentId);

    createdPaths.push(workspaceDir, experimentDataDir);

    fs.mkdirSync(path.join(artifactsDir, 'figures'), { recursive: true });
    fs.mkdirSync(path.join(workspaceDir, 'results', 'empty-child'), { recursive: true });
    fs.mkdirSync(path.join(workspaceDir, '.github'), { recursive: true });
    fs.writeFileSync(path.join(artifactsDir, 'figures', 'plot.png'), 'plot');
    fs.writeFileSync(path.join(workspaceDir, 'report.md'), '# report\n');
    fs.writeFileSync(path.join(workspaceDir, 'process-log.jsonl'), '{"ok":true}\n');
    fs.writeFileSync(path.join(workspaceDir, 'container-run.log'), 'skip me\n');
    fs.writeFileSync(path.join(workspaceDir, '.github', 'ignored.txt'), 'ignored\n');

    const files = listArtifacts(experimentId);
    expect(files).toEqual([
      'figures/plot.png',
      'process-log.jsonl',
      'report.md',
    ]);

    const entries = listArtifactEntries(experimentId);
    expect(entries).toEqual([
      { path: 'figures', type: 'directory' },
      { path: 'figures/plot.png', type: 'file' },
      { path: 'process-log.jsonl', type: 'file' },
      { path: 'report.md', type: 'file' },
      { path: 'results', type: 'directory' },
      { path: 'results/empty-child', type: 'directory' },
    ]);
  });
});
