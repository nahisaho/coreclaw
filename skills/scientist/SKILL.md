---
name: scientific-assistant
description: |
  Comprehensive scientific research assistant powered by SATORI Agent Skills.
  195 specialized sub-skills covering bayesian statistics, deep research,
  molecular modeling, genomics, clinical NLP, cheminformatics, advanced
  visualization, and more. Supports the SHIKIGAMI paradigm
  (Think → Report → Action iterative cycle) for systematic research workflows.
---

# Scientific Assistant

A comprehensive collection of 195 scientific research skills from SATORI,
organized as sub-skill directories within this skill package.

## ⚠️ 必須：成果物のファイル保存ルール（全サブスキル共通）

**すべての成果物は必ずファイルとして保存すること。チャット欄への出力のみで終わる
ことは禁止。**

| 成果物の種類 | 保存形式 | 保存先の例 |
|---|---|---|
| レポート・分析結果 | `report.md` / `report.txt` | `/workspace/group/` |
| コード・スクリプト | `.py` / `.r` / `.sh` | `/workspace/group/` |
| 数値結果・統計サマリー | `results.json` / `summary.csv` | `/workspace/group/results/` |
| 図表・グラフ | `.png` / `.svg` / `.pdf` | `/workspace/group/figures/` |
| 論文・ドラフト | `paper.md` / `paper.tex` | `/workspace/group/` |
| データ処理済みファイル | `.csv` / `.tsv` / `.parquet` | `/workspace/group/data/` |

### 標準ディレクトリ構造

```
/workspace/group/
├── report.md          ← メインレポート（必須）
├── figures/           ← グラフ・図表
│   ├── figure_01.png
│   └── figure_02.png
├── results/           ← JSON/CSV/テキスト結果
│   └── summary.json
└── data/              ← 処理済みデータ
    └── processed.csv
```

### Python スクリプトの場合の必須パターン

```python
from pathlib import Path

# ワークスペースのベースディレクトリ
BASE_DIR = Path("/workspace/group")
FIG_DIR  = BASE_DIR / "figures"
RES_DIR  = BASE_DIR / "results"
DATA_DIR = BASE_DIR / "data"

for d in [FIG_DIR, RES_DIR, DATA_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# 図は必ずファイルに保存（plt.show() は使わない）
fig.savefig(FIG_DIR / "figure_01.png", dpi=300, bbox_inches="tight")
plt.close(fig)

# 結果は JSON/CSV で保存
import json
with open(RES_DIR / "summary.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

# テキストレポートも保存
with open(BASE_DIR / "report.md", "w", encoding="utf-8") as f:
    f.write(report_content)
```

### レポートの必須構成

レポートファイル（`report.md`）には以下を含めること：

1. **タイトルと実行日時**
2. **目的・背景**
3. **方法・手順の概要**
4. **結果の要約**（数値・統計量を含む）
5. **考察・結論**
6. **生成ファイル一覧**（figures/, results/ の内容リスト）

---

## Capabilities

- **Data Analysis**: Bayesian statistics, time-series, anomaly detection, causal inference
- **Life Sciences**: AlphaFold structures, genomics, ADMET pharmacokinetics, clinical NLP
- **Chemistry**: Cheminformatics, molecular dynamics, reaction predictions
- **Research Workflows**: Deep research, systematic reviews, experiment design
- **Visualization**: Advanced plotting, network graphs, geospatial mapping
- **AI/ML**: Active learning, transfer learning, ensemble methods, NLP

## Usage

Each sub-skill is automatically loaded and activated based on the user's request.
The SHIKIGAMI paradigm guides complex research tasks through iterative cycles
of thinking, reporting, and acting.

**重要**: タスク完了時にチャット欄に出力するのは「保存したファイルの一覧と概要」
のみ。分析結果・コード・図表の実体はすべてファイルに保存済みであること。

## MCP連携

`deep-research` MCP サーバーが有効な場合、文献調査・先行研究調査・トピックの網羅的調査時に
MCP の `deep-research` プロンプトテンプレートを活用してください。
MCP が提供する構造化リサーチ（課題精緻化→サブ質問分解→Web検索→ソース評価→レポート生成）を
科学研究のエビデンス階層評価と組み合わせて使用してください。
調査レポートはチャットに貼り付けるのではなく、`report.md` として保存すること。

## Education Theory Database

Shared with `teaching-assistant`. Data is stored at `skills/teaching-assistant/data/`:

| File | Size | Contents |
|------|------|----------|
| `theories.db` | 1.5MB | 175 education theories (SQLite FTS5 trigram) |
| `theories.json` | 315KB | Education theories in JSON |
| `relations.json` | 9.4KB | Inter-theory relationships (77 entries) |
| `curriculum/*.md` | 5.2MB | Japanese curriculum guidelines (elementary/middle/high school) |

