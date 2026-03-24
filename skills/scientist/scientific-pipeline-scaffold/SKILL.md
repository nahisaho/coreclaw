---
name: scientific-pipeline-scaffold
description: |
  科学データ解析パイプラインの基盤スキル。ディレクトリ構造の自動構築、再現性のためのシード管理、
  進捗ログ出力、実行時間計測、JSON サマリー生成、ダッシュボード総括図の作成を行う際に使用。
  全 13 実験に共通する足場パターンを統合。
tu_tools:
  - key: biotools
    name: bio.tools
    description: パイプライン構成ツール検索
---

# Scientific Pipeline Scaffold

全 Exp-01〜13 に共通する「足場（scaffold）」パターンを統合したスキル。
新しい実験パイプラインを立ち上げる際に最初に適用し、再現性・可読性・構造を保証する。

## When to Use

- 新しい解析実験のスクリプトを立ち上げるとき
- 再現可能な実験パイプラインを構築するとき
- 解析結果をJSON サマリーとしてエクスポートしたいとき
- 総括ダッシュボード図を自動生成したいとき

## Quick Start

## 1. スクリプトヘッダーテンプレート

```python
#!/usr/bin/env python3
"""
Exp-XX: [実験タイトル]
Scientific Skills Series

Description:
    [1-2行の概要]

Author: [名前]
Date: [YYYY-MM-DD]
"""

import warnings
warnings.filterwarnings("ignore")

import matplotlib
matplotlib.use("Agg")  # headless 環境対応

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
import json
import time

# === 再現性設定 ===
SEED = 42
np.random.seed(SEED)

# === ディレクトリ構造 ===
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
FIG_DIR = BASE_DIR / "figures"
RESULTS_DIR = BASE_DIR / "results"

for d in [DATA_DIR, FIG_DIR, RESULTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# === 出版品質スタイル ===
plt.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Noto Sans CJK JP", "IPAGothic", "Arial", "Helvetica", "DejaVu Sans"],
    "font.size": 10,
    "axes.titlesize": 12,
    "axes.labelsize": 11,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "savefig.dpi": 300,
    "savefig.bbox": "tight",
    "figure.facecolor": "white",
})
```

## 2. メイン関数テンプレート

```python
def main():
    """メインパイプライン実行関数。"""
    start_time = time.time()
    print("=" * 60)
    print("Exp-XX: [実験タイトル]")
    print("=" * 60)

    # ──── Step 0: 仮説・ワークフロー定義の保存 ────
    print("\n[Step 0] 仮説・ワークフロー定義の保存...")
    # → scientific-hypothesis-pipeline スキル参照
    # save_hypothesis_markdown(HYPOTHESIS)
    # save_hypothesis_json(HYPOTHESIS)
    # save_workflow_design(HYPOTHESIS, workflow_steps)
    # save_workflow_json(HYPOTHESIS, workflow_steps)

    # ──── Step 1: データ読み込み / 生成 ────
    print("\n[Step 1] データ読み込み...")
    # df = pd.read_csv(DATA_DIR / "dataset.csv")
    # df = generate_dataset()
    # df.to_csv(DATA_DIR / "dataset.csv", index=False)

    # ──── Step 2: EDA ────
    print("\n[Step 2] 探索的データ解析...")
    # → scientific-eda-correlation スキル参照

    # ──── Step 3: 前処理 ────
    print("\n[Step 3] 前処理...")
    # → scientific-data-preprocessing スキル参照

    # ──── Step 4: モデル学習 ────
    print("\n[Step 4] モデル学習...")
    # → scientific-ml-regression / ml-classification スキル参照

    # ──── Step 5: 可視化 ────
    print("\n[Step 5] 可視化...")
    # → scientific-publication-figures スキル参照

    # ──── Step 6: 仮説判定 ────
    print("\n[Step 6] 仮説判定...")
    # → scientific-hypothesis-pipeline スキル参照
    # hypothesis_verdict = evaluate_hypothesis(result, HYPOTHESIS)

    # ──── Step 7: サマリー ────
    elapsed = time.time() - start_time
    print(f"\n[Step 7] サマリー生成... (elapsed: {elapsed:.1f}s)")
    # → generate_summary() 呼び出し

    # ──── Step 8: 論文執筆・レビュー ────
    print("\n[Step 8] 論文執筆・レビュー...")
    # → scientific-academic-writing スキルで草稿作成
    # → scientific-critical-review スキルでレビュー・修正

    print("\n" + "=" * 60)
    print(f"完了！ ({elapsed:.1f} 秒)")
    print("=" * 60)


if __name__ == "__main__":
    main()
```

## 3. 進捗ログユーティリティ

```python
class StepLogger:
    """段階的進捗ログを管理するユーティリティ。"""

    def __init__(self, experiment_name):
        self.experiment_name = experiment_name
        self.step_count = 0
        self.start_time = time.time()
        self.step_times = {}
        print("=" * 60)
        print(f"{experiment_name}")
        print("=" * 60)

    def step(self, description):
        """新しい Step を開始する。"""
        self.step_count += 1
        step_start = time.time()
        if self.step_count > 1:
            prev = self.step_count - 1
            self.step_times[prev] = time.time() - self._current_step_start
        self._current_step_start = step_start
        print(f"\n[Step {self.step_count}] {description}...")

    def finish(self):
        """パイプライン完了を記録する。"""
        elapsed = time.time() - self.start_time
        if self.step_count > 0:
            self.step_times[self.step_count] = time.time() - self._current_step_start
        print(f"\n{'=' * 60}")
        print(f"完了！ (合計 {elapsed:.1f} 秒)")
        for step_num, t in self.step_times.items():
            print(f"  Step {step_num}: {t:.1f}s")
        print(f"{'=' * 60}")
        return elapsed
```

## 4. JSON サマリー生成

全実験で共通する `analysis_summary.json` のスキーマ。

```python
def generate_summary(results_dict, experiment_name, elapsed_seconds,
                     output_path=None):
    """
    標準フォーマットの analysis_summary.json を生成する。

    results_dict はドメイン固有の結果を含む辞書。
    この関数がメタ情報を自動追加する。
    """
    import datetime

    summary = {
        "experiment": experiment_name,
        "timestamp": datetime.datetime.now().isoformat(),
        "elapsed_seconds": round(elapsed_seconds, 2),
        "environment": {
            "python": __import__("sys").version,
            "seed": SEED,
        },
        "data": {
            "n_samples": results_dict.get("n_samples"),
            "n_features": results_dict.get("n_features"),
            "source": results_dict.get("data_source", "simulation"),
        },
        "results": results_dict,
    }

    if output_path is None:
        output_path = RESULTS_DIR / "analysis_summary.json"

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False, default=str)

    print(f"  → Summary saved: {output_path}")
    return summary
```

### JSON サマリー標準キー一覧

| キー | 型 | 説明 | 必須 |
|---|---|---|---|
| `experiment` | str | 実験名 | ✅ |
| `timestamp` | str | ISO 8601 日時 | ✅ |
| `elapsed_seconds` | float | 実行時間 | ✅ |
| `environment.python` | str | Python バージョン | ✅ |
| `environment.seed` | int | 乱数シード | ✅ |
| `data.n_samples` | int | サンプル数 | ✅ |
| `data.n_features` | int | 特徴量数 | ○ |
| `data.source` | str | データソース | ○ |
| `results.best_model` | str | 最良モデル名 | ○ |
| `results.best_r2` / `best_auc` | float | 最良スコア | ○ |
| `results.n_figures` | int | 生成図数 | ○ |

## 5. 総括ダッシュボードパネル

```python
import matplotlib.gridspec as gridspec

def create_summary_panel(panel_data, experiment_name, figsize=(20, 14)):
    """
    解析結果の総括ダッシュボードを 1 枚の Figure にまとめる。

    panel_data: [
        {"type": "table", "title": "...", "data": df_or_dict},
        {"type": "plot_func", "title": "...", "func": callable, "kwargs": {}},
        {"type": "text", "title": "...", "text": "..."},
        {"type": "metrics_bar", "title": "...", "names": [...], "values": [...]},
    ]
    """
    n_panels = len(panel_data)
    ncols = min(3, n_panels)
    nrows = (n_panels + ncols - 1) // ncols

    fig = plt.figure(figsize=figsize)
    gs = gridspec.GridSpec(nrows, ncols, figure=fig, hspace=0.4, wspace=0.3)

    for i, panel in enumerate(panel_data):
        row, col = divmod(i, ncols)
        ax = fig.add_subplot(gs[row, col])

        ptype = panel["type"]
        title = panel.get("title", f"Panel {chr(65 + i)}")

        if ptype == "metrics_bar":
            ax.barh(panel["names"], panel["values"],
                   color="steelblue", edgecolor="black")
            ax.set_xlabel("Value")

        elif ptype == "text":
            ax.text(0.05, 0.95, panel["text"], transform=ax.transAxes,
                   fontsize=9, verticalalignment="top", fontfamily="monospace",
                   bbox=dict(boxstyle="round", facecolor="wheat", alpha=0.5))
            ax.axis("off")

        elif ptype == "table":
            ax.axis("off")
            if isinstance(panel["data"], pd.DataFrame):
                tbl = ax.table(cellText=panel["data"].values,
                              colLabels=panel["data"].columns,
                              cellLoc="center", loc="center")
                tbl.auto_set_font_size(False)
                tbl.set_fontsize(8)
            elif isinstance(panel["data"], dict):
                rows = [[k, str(v)] for k, v in panel["data"].items()]
                tbl = ax.table(cellText=rows, colLabels=["Metric", "Value"],
                              cellLoc="center", loc="center")
                tbl.auto_set_font_size(False)
                tbl.set_fontsize(9)

        elif ptype == "plot_func":
            panel["func"](ax=ax, **panel.get("kwargs", {}))

        # パネルラベル (A, B, C, ...)
        ax.set_title(f"({chr(65 + i)}) {title}", fontsize=11, fontweight="bold")

    fig.suptitle(f"Summary: {experiment_name}", fontsize=14, fontweight="bold")
    plt.savefig(FIG_DIR / "summary_panel.png", dpi=300, bbox_inches="tight")
    plt.close()
```

## 6. 共通ユーティリティ

```python
def save_fig(fig, filename, dpi=300, formats=("png",)):
    """図を保存してクローズする共通関数。"""
    for fmt in formats:
        fig.savefig(FIG_DIR / f"{filename}.{fmt}",
                   dpi=dpi, bbox_inches="tight",
                   facecolor="white", edgecolor="none")
    plt.close(fig)
    print(f"  → Figure saved: {filename}")


def save_results(df, filename, index=False):
    """DataFrame を results/ に保存する共通関数。"""
    path = RESULTS_DIR / filename
    df.to_csv(path, index=index)
    print(f"  → Results saved: {filename}")
```

## ディレクトリ構造の標準

```
Exp-XX/
├── exp_analysis.py          # メインスクリプト
├── qiita-exp-analysis.md    # Qiita 記事
├── data/
│   └── dataset.csv          # 入力データ
├── figures/
│   ├── Fig01_*.png          # 個別図（Fig + 連番 + 説明）
│   ├── Fig02_*.png
│   └── summary_panel.png    # 総括ダッシュボード
└── results/
    ├── descriptive_statistics.csv
    ├── model_metrics.csv
    ├── feature_importance.csv
    └── analysis_summary.json  # JSON サマリー
```

## ToolUniverse 連携

| TU Key | ツール名 | 連携内容 |
|--------|---------|--------|
| `biotools` | bio.tools | パイプライン構成ツール検索 |

## References

### 参照スキル

| スキル | 連携 |
|---|---|
| `scientific-hypothesis-pipeline` | Step 0: 仮説立案・ワークフロー設計の保存 |
| `scientific-data-preprocessing` | Step 1/3: データ読み込み・前処理 |
| `scientific-eda-correlation` | Step 2: 探索的データ解析・相関分析 |
| `scientific-ml-regression` | Step 4: 回帰モデル学習 |
| `scientific-ml-classification` | Step 4: 分類モデル学習 |
| `scientific-publication-figures` | Step 5: 論文品質の図表生成 |
| `scientific-academic-writing` | Step 8: 論文執筆 |
| `scientific-critical-review` | Step 8: 草稿の批判的レビュー・修正 |

### Exp 参照

- **全 13 実験**: ディレクトリ構造、シード管理、warnings 抑制
- **Exp-12, 13**: `main()` + 実行時間計測 + JSON サマリー + 総括パネル
- **Exp-10**: `save_fig()` / `write_summary()` ユーティリティ
