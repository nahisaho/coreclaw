---
name: scientific-hypothesis-pipeline
description: |
  ユーザーのプロンプト（研究テーマ・データ記述）から仮説を立案し、
  検証用の解析パイプラインを自動生成するスキル。PICO/PECO フレームワークによる
  仮説構造化、適切な統計検定の選択、パイプラインコード生成を行う。
  「仮説を立てて」「このデータで何がわかる？」「解析パイプラインを作って」で発火。
tu_tools:
  - key: open_alex
    name: OpenAlex
    description: 仮説関連文献の網羅的検索
---

# Scientific Hypothesis-Driven Pipeline Generator

ユーザーが入力した自然言語プロンプトから研究仮説を立案し、
仮説検証のための完全な解析パイプラインを自動生成するスキル。

## When to Use

- ユーザーが研究テーマやデータの概要をプロンプトで入力したとき
- データから検証可能な仮説を立案したいとき
- 仮説に適した解析パイプラインを自動構築したいとき
- 探索的なデータ分析から仮説駆動型の分析に移行したいとき
- 研究計画の立案を支援してほしいとき

## Quick Start

## 1. プロンプト解析と仮説立案フロー

```
ユーザープロンプト
  ├─ Phase 1: プロンプト解析
  │   ├─ 研究テーマの抽出
  │   ├─ データの種類・構造の推定
  │   └─ 変数（独立・従属・交絡）の特定
  ├─ Phase 2: 仮説立案
  │   ├─ PICO/PECO フレームワークで構造化
  │   ├─ 帰無仮説 (H₀) / 対立仮説 (H₁) の定式化
  │   └─ 複数仮説の優先順位付け
  ├─ Phase 3: パイプライン設計
  │   ├─ 適切なスキルの選択・組み合わせ
  │   ├─ 統計検定の選択
  │   └─ サンプルサイズ・検出力の見積もり
  └─ Phase 4: コード生成
      ├─ scientific-pipeline-scaffold ベースのスクリプト生成
      ├─ 各 Step に対応するスキルのコードを組み込み
      └─ JSON サマリーに仮説検証結果を含める
```

## 2. プロンプト解析テンプレート

ユーザーのプロンプトから以下の要素を抽出する。

```markdown
## プロンプト解析シート

### 入力プロンプト
> [ユーザーの入力をそのまま記載]

### 抽出された要素

| 要素 | 内容 |
|---|---|
| **研究テーマ** | [大分野 → 小分野] |
| **研究対象** | [対象物・サンプル・データソース] |
| **独立変数 (X)** | [操作・条件・群分け変数] |
| **従属変数 (Y)** | [測定・応答・アウトカム変数] |
| **交絡候補** | [制御すべき共変量] |
| **データ型** | [連続 / カテゴリカル / 時系列 / 画像 / テキスト] |
| **サンプルサイズ** | [既知の場合。不明なら推定] |
| **比較構造** | [2群 / 多群 / 前後 / 相関 / 回帰 / 分類] |
```

## 3. PICO/PECO フレームワークによる仮説構造化

```markdown
## 仮説構造化テンプレート

### PICO (intervention 研究向け)
| 要素 | 定義 | 記入 |
|---|---|---|
| **P** (Population) | 対象集団 | [例: 2024年に合成した Ti-6Al-4V 合金試料] |
| **I** (Intervention) | 介入・処理 | [例: 熱処理温度を 500-900°C で変化] |
| **C** (Comparison) | 比較対照 | [例: 未処理 (as-cast) 試料] |
| **O** (Outcome) | アウトカム | [例: ビッカース硬さ (HV)] |

### PECO (観察研究向け)
| 要素 | 定義 | 記入 |
|---|---|---|
| **P** (Population) | 対象集団 | [例: 大腸がん患者コホート (n=500)] |
| **E** (Exposure) | 曝露因子 | [例: 腸内細菌叢の多様性 (Shannon index)] |
| **C** (Comparison) | 比較対照 | [例: 健常者コントロール群] |
| **O** (Outcome) | アウトカム | [例: 5年生存率] |

### 仮説の定式化
**研究仮説 (H₁)**: [PICO/PECO の I/E が O に対して有意な効果を持つ]
**帰無仮説 (H₀)**: [I/E は O に対して効果を持たない（差がない）]

### 副次仮説（該当する場合）
- H₁ₐ: [副次仮説 1]
- H₁ᵦ: [副次仮説 2]
```

## 3.1 仮説定義のファイル保存

仮説を立案した時点で、以下の 2 形式でファイルに永続化する。
これにより、後続のパイプライン・レビュー・論文執筆で仮説を参照可能にする。

### 3.1.1 Markdown 形式（人間可読）

`docs/hypothesis.md` に保存する。

```python
def save_hypothesis_markdown(hypothesis, filepath=None):
    """
    仮説定義を Markdown ファイルとして保存する。
    
    Args:
        hypothesis: dict — HYPOTHESIS 定義
        filepath: Path — 保存先（デフォルト: docs/hypothesis.md）
    """
    import datetime
    
    if filepath is None:
        filepath = BASE_DIR / "docs" / "hypothesis.md"
    filepath.parent.mkdir(parents=True, exist_ok=True)
    
    content = f"""# 研究仮説定義書

> 生成日時: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}

## フレームワーク: {hypothesis['framework']}

| 要素 | 内容 |
|---|---|
| **P** (Population) | {hypothesis['population']} |
| **{'I' if hypothesis['framework'] == 'PICO' else 'E'}** ({'Intervention' if hypothesis['framework'] == 'PICO' else 'Exposure'}) | {hypothesis['intervention_or_exposure']} |
| **C** (Comparison) | {hypothesis['comparison']} |
| **O** (Outcome) | {hypothesis['outcome']} |

## 仮説

- **研究仮説 (H₁)**: {hypothesis['H1']}
- **帰無仮説 (H₀)**: {hypothesis['H0']}

## 統計パラメータ

- 有意水準 α = {hypothesis['alpha']}
- 目標検出力 = {hypothesis['power_target']}
"""
    # 副次仮説があれば追加
    if hypothesis.get('sub_hypotheses'):
        content += "\n## 副次仮説\n\n"
        for sub_id, sub_desc in hypothesis['sub_hypotheses'].items():
            content += f"- **{sub_id}**: {sub_desc}\n"
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    
    print(f"  → 仮説定義書を保存: {filepath}")
    return filepath
```

### 3.1.2 JSON 形式（機械可読）

`docs/hypothesis.json` に保存する。パイプライン・レビュースキルが参照する。

```python
def save_hypothesis_json(hypothesis, filepath=None):
    """
    仮説定義を JSON ファイルとして保存する。
    後続スキル（critical-review, academic-writing）が参照する。
    """
    import datetime
    
    if filepath is None:
        filepath = BASE_DIR / "docs" / "hypothesis.json"
    filepath.parent.mkdir(parents=True, exist_ok=True)
    
    data = {
        "version": "1.0",
        "created_at": datetime.datetime.now().isoformat(),
        "hypothesis": hypothesis,
    }
    
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=str)
    
    print(f"  → 仮説定義 JSON を保存: {filepath}")
    return filepath
```

### 3.1.3 既存仮説ファイルの読み込み

```python
def load_hypothesis(filepath=None):
    """
    保存済みの仮説定義を読み込む。
    パイプライン再実行時やレビュー時に使用。
    """
    if filepath is None:
        filepath = BASE_DIR / "docs" / "hypothesis.json"
    
    if not filepath.exists():
        print(f"  ⚠ 仮説ファイルが見つかりません: {filepath}")
        return None
    
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    print(f"  → 仮説定義を読み込み: {filepath}")
    print(f"    H₁: {data['hypothesis']['H1']}")
    return data['hypothesis']
```

## 4. 仮説から解析手法への自動マッピング

```markdown
## 解析手法選択ガイド

### 比較構造 × データ型 → 推奨手法

| 比較構造 | 従属変数 | 独立変数 | 推奨手法 | 参照スキル |
|---|---|---|---|---|
| 2群比較 | 連続 (正規) | カテゴリカル | Welch t 検定 | statistical-testing |
| 2群比較 | 連続 (非正規) | カテゴリカル | Mann-Whitney U | statistical-testing |
| 多群比較 | 連続 (正規) | カテゴリカル | ANOVA + Tukey | statistical-testing |
| 多群比較 | 連続 (非正規) | カテゴリカル | Kruskal-Wallis + Dunn | statistical-testing |
| 相関 | 連続 | 連続 | Pearson / Spearman | eda-correlation |
| 回帰 | 連続 | 連続/混合 | Linear / Ridge / RF | ml-regression |
| 分類 | カテゴリカル | 連続/混合 | RF / SVM / XGBoost | ml-classification |
| 時系列 | 連続 | 時間 | STL分解 / ARIMA | time-series |
| 生存 | イベント時間 | 混合 | Kaplan-Meier / Cox PH | survival-clinical |
| 因果推論 | 連続/二値 | 混合 | PSM / DiD / IV | causal-inference |
| 用量応答 | 連続 | 連続 | RSM / GP | process-optimization |
| 次元削減 | 高次元 | — | PCA / t-SNE / UMAP | pca-tsne |
```

## 4.1 ワークフロー設計のファイル保存

パイプライン設計（ワークフロー）を `docs/workflow_design.md` と
`docs/workflow_design.json` に永続化する。これにより設計の変更履歴を Git で追跡し、
論文の Methods セクション執筆時に正確なワークフローを参照できる。

### 4.1.1 ワークフロー Markdown 保存

```python
def save_workflow_design(hypothesis, steps, filepath=None):
    """
    パイプラインのワークフロー設計を Markdown ファイルとして保存する。
    
    Args:
        hypothesis: dict — 仮説定義
        steps: list[dict] — パイプラインステップ
            各ステップ: {"id": "step_1", "name": "データ読み込み",
                         "skill": "data-preprocessing", "params": {...},
                         "inputs": [...], "outputs": [...]}
        filepath: Path — 保存先（デフォルト: docs/workflow_design.md）
    """
    import datetime
    
    if filepath is None:
        filepath = BASE_DIR / "docs" / "workflow_design.md"
    filepath.parent.mkdir(parents=True, exist_ok=True)
    
    content = f"""# ワークフロー設計書

> 生成日時: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}

## 検証対象の仮説

- **H₁**: {hypothesis['H1']}
- **H₀**: {hypothesis['H0']}

## パイプライン概要

```
"""
    # フローチャート生成
    for i, step in enumerate(steps):
        prefix = "├─" if i < len(steps) - 1 else "└─"
        content += f"  {prefix} Step {i+1}: {step['name']}\n"
        if step.get('skill'):
            content += f"  │   └─ Skill: {step['skill']}\n"
    
    content += "```\n\n## ステップ詳細\n\n"
    
    for i, step in enumerate(steps):
        content += f"""### Step {i+1}: {step['name']}

| 項目 | 内容 |
|---|---|
| **使用スキル** | {step.get('skill', 'N/A')} |
| **入力** | {', '.join(step.get('inputs', ['—']))} |
| **出力** | {', '.join(step.get('outputs', ['—']))} |
| **パラメータ** | {step.get('params', '—')} |

"""
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    
    print(f"  → ワークフロー設計書を保存: {filepath}")
    return filepath
```

### 4.1.2 ワークフロー JSON 保存

```python
def save_workflow_json(hypothesis, steps, filepath=None):
    """
    パイプラインのワークフロー設計を JSON として保存する。
    パイプラインの再構築・修正時に参照する。
    """
    import datetime
    
    if filepath is None:
        filepath = BASE_DIR / "docs" / "workflow_design.json"
    filepath.parent.mkdir(parents=True, exist_ok=True)
    
    data = {
        "version": "1.0",
        "created_at": datetime.datetime.now().isoformat(),
        "hypothesis_ref": {
            "H1": hypothesis["H1"],
            "H0": hypothesis["H0"],
            "framework": hypothesis["framework"],
        },
        "pipeline": {
            "total_steps": len(steps),
            "steps": steps,
        },
    }
    
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=str)
    
    print(f"  → ワークフロー設計 JSON を保存: {filepath}")
    return filepath
```

### 4.1.3 既存ワークフロー設計の読み込み

```python
def load_workflow_design(filepath=None):
    """
    保存済みのワークフロー設計を読み込む。
    パイプラインの再実行・修正時に使用。
    """
    if filepath is None:
        filepath = BASE_DIR / "docs" / "workflow_design.json"
    
    if not filepath.exists():
        print(f"  ⚠ ワークフロー設計ファイルが見つかりません: {filepath}")
        return None
    
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    print(f"  → ワークフロー設計を読み込み: {filepath}")
    print(f"    ステップ数: {data['pipeline']['total_steps']}")
    return data
```

## 5. パイプラインコード自動生成

### 5.1 生成スクリプトの構造

ユーザーのプロンプトから以下の構造のスクリプトを自動生成する。

```python
#!/usr/bin/env python3
"""
Hypothesis-Driven Analysis Pipeline
Generated from user prompt by scientific-hypothesis-pipeline skill

Hypothesis: [H₁ の記述]
Null Hypothesis: [H₀ の記述]
Framework: [PICO / PECO]

Author: [名前]
Date: [YYYY-MM-DD]
"""

import warnings
warnings.filterwarnings("ignore")

import matplotlib
matplotlib.use("Agg")

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from scipy import stats
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
# ⚠️ RULE: All graph text (titles, axis labels, legends, annotations) MUST be in English.
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


# ============================================================
# Hypothesis Definition
# ============================================================
HYPOTHESIS = {
    "framework": "PICO",  # or "PECO"
    "population": "[対象集団]",
    "intervention_or_exposure": "[介入または曝露]",
    "comparison": "[比較対照]",
    "outcome": "[アウトカム]",
    "H1": "[対立仮説の記述]",
    "H0": "[帰無仮説の記述]",
    "alpha": 0.05,
    "power_target": 0.80,
}


def main():
    start_time = time.time()
    print("=" * 60)
    print("Hypothesis-Driven Analysis Pipeline")
    print(f"H₁: {HYPOTHESIS['H1']}")
    print("=" * 60)

    # ──── Step 0: 仮説・ワークフロー設計の保存 ────
    print("\n[Step 0] 仮説・ワークフロー定義の保存...")
    save_hypothesis_markdown(HYPOTHESIS)
    save_hypothesis_json(HYPOTHESIS)

    # ワークフロー設計の定義
    workflow_steps = [
        {"id": "step_1", "name": "データ読み込み / 生成",
         "skill": "data-preprocessing", "inputs": ["raw data"],
         "outputs": ["data/dataset.csv"]},
        {"id": "step_2", "name": "データ品質チェック",
         "skill": "data-preprocessing", "inputs": ["data/dataset.csv"],
         "outputs": ["results/data_quality.json"]},
        {"id": "step_3", "name": "探索的データ解析",
         "skill": "eda-correlation", "inputs": ["data/dataset.csv"],
         "outputs": ["figures/eda_*.png"]},
        {"id": "step_4", "name": "前処理",
         "skill": "data-preprocessing", "inputs": ["data/dataset.csv"],
         "outputs": ["data/dataset_processed.csv"]},
        {"id": "step_5", "name": "仮説検証",
         "skill": "[自動選択]", "inputs": ["data/dataset_processed.csv"],
         "outputs": ["results/test_results.json"]},
        {"id": "step_6", "name": "結果の可視化",
         "skill": "publication-figures", "inputs": ["results/"],
         "outputs": ["figures/*.png"]},
        {"id": "step_7", "name": "仮説判定",
         "skill": "hypothesis-pipeline", "inputs": ["results/test_results.json"],
         "outputs": ["results/hypothesis_verdict.json"]},
        {"id": "step_8", "name": "サマリー生成",
         "skill": "pipeline-scaffold", "inputs": ["results/"],
         "outputs": ["results/analysis_summary.json"]},
    ]
    save_workflow_design(HYPOTHESIS, workflow_steps)
    save_workflow_json(HYPOTHESIS, workflow_steps)

    # ──── Step 1: データ読み込み / 生成 ────
    print("\n[Step 1] データ読み込み...")
    # df = pd.read_csv(DATA_DIR / "dataset.csv")
    # → scientific-data-simulation でデータ生成する場合:
    # df = generate_synthetic_data()
    # df.to_csv(DATA_DIR / "dataset.csv", index=False)

    # ──── Step 2: データ品質チェック ────
    print("\n[Step 2] データ品質チェック...")
    # → scientific-data-preprocessing: data_quality_report(df)

    # ──── Step 3: 探索的データ解析 (EDA) ────
    print("\n[Step 3] 探索的データ解析...")
    # → scientific-eda-correlation: descriptive_statistics(), plot_distributions()
    # → scientific-eda-correlation: plot_correlation_heatmap()

    # ──── Step 4: 前処理 ────
    print("\n[Step 4] 前処理...")
    # → scientific-data-preprocessing: handle_missing_values(), scale_data()

    # ──── Step 5: 仮説検証 ────
    print("\n[Step 5] 仮説検証...")
    # [仮説に応じた統計検定 / モデリング / 解析コードをここに配置]
    # 例: 2群比較の場合
    # result = two_group_test(group1, group2)
    # 例: 回帰モデルの場合
    # result = train_evaluate_regression(X_train, y_train, X_test, y_test)

    # ──── Step 6: 結果の可視化 ────
    print("\n[Step 6] 結果の可視化...")
    # → scientific-publication-figures: 仮説に適した図表を生成
    # 図は figures/ に保存し、論文原稿に埋め込み可能にする

    # ──── Step 7: 仮説判定 ────
    print("\n[Step 7] 仮説判定...")
    # hypothesis_verdict = evaluate_hypothesis(result, HYPOTHESIS)

    # ──── Step 8: サマリー生成 ────
    elapsed = time.time() - start_time
    print(f"\n[Step 8] サマリー生成... (elapsed: {elapsed:.1f}s)")

    # summary = generate_hypothesis_summary(
    #     hypothesis=HYPOTHESIS,
    #     test_results=result,
    #     verdict=hypothesis_verdict,
    #     elapsed=elapsed,
    # )

    print("\n" + "=" * 60)
    print(f"完了！ ({elapsed:.1f} 秒)")
    print("=" * 60)


if __name__ == "__main__":
    main()
```

### 5.2 仮説判定ロジック

```python
def evaluate_hypothesis(test_results, hypothesis):
    """
    統計検定の結果に基づいて仮説を判定する。

    Returns:
        dict: 判定結果（verdict, evidence_level, interpretation）
    """
    alpha = hypothesis["alpha"]
    p_value = test_results.get("p_value")
    effect_size = test_results.get("cohens_d") or test_results.get("effect_size_value")

    # 判定
    if p_value is None:
        verdict = "INCONCLUSIVE"
        evidence = "検定結果なし"
    elif p_value < alpha:
        verdict = "REJECT_H0"
        evidence = f"H₀ を棄却 (p = {p_value:.4f} < α = {alpha})"
    else:
        verdict = "FAIL_TO_REJECT_H0"
        evidence = f"H₀ を棄却できず (p = {p_value:.4f} ≥ α = {alpha})"

    # 効果量の解釈
    if effect_size is not None:
        effect_interp = (
            "大きい効果" if abs(effect_size) > 0.8 else
            "中程度の効果" if abs(effect_size) > 0.5 else
            "小さい効果" if abs(effect_size) > 0.2 else
            "無視できる効果"
        )
    else:
        effect_interp = "効果量未算出"

    result = {
        "verdict": verdict,
        "p_value": p_value,
        "alpha": alpha,
        "effect_size": effect_size,
        "effect_interpretation": effect_interp,
        "evidence": evidence,
        "interpretation": _generate_interpretation(verdict, hypothesis, test_results),
    }

    print(f"  仮説判定: {verdict}")
    print(f"  {evidence}")
    print(f"  効果量: {effect_interp}")

    return result


def _generate_interpretation(verdict, hypothesis, results):
    """仮説判定の解釈文を生成する。"""
    if verdict == "REJECT_H0":
        return (
            f"統計的に有意な結果が得られた。"
            f"{hypothesis['H1']} が支持される。"
            f"ただし、統計的有意性は実用的有意性を保証しない。"
            f"効果量と信頼区間も合わせて解釈すること。"
        )
    elif verdict == "FAIL_TO_REJECT_H0":
        return (
            f"統計的に有意な差は検出されなかった。"
            f"これは「差がない」ことの証明ではなく、"
            f"「現在のデータでは差を検出できなかった」ことを意味する。"
            f"サンプルサイズの増加や検出力分析を検討すること。"
        )
    else:
        return "検定結果が不十分。データの確認が必要。"
```

### 5.3 検出力分析・サンプルサイズ計算

```python
from scipy import stats as sp_stats

def power_analysis(effect_size, alpha=0.05, power=0.80, test_type="two_sample_t"):
    """
    検出力分析によるサンプルサイズ計算。

    effect_size: Cohen's d（小=0.2, 中=0.5, 大=0.8）
    """
    if test_type == "two_sample_t":
        # 近似式: n ≈ (z_α/2 + z_β)² × 2 / d²
        z_alpha = sp_stats.norm.ppf(1 - alpha / 2)
        z_beta = sp_stats.norm.ppf(power)
        n_per_group = int(np.ceil(2 * ((z_alpha + z_beta) / effect_size) ** 2))
    elif test_type == "one_sample_t":
        z_alpha = sp_stats.norm.ppf(1 - alpha / 2)
        z_beta = sp_stats.norm.ppf(power)
        n_per_group = int(np.ceil(((z_alpha + z_beta) / effect_size) ** 2))
    elif test_type == "chi_square":
        # Cochran の公式の近似
        z_alpha = sp_stats.norm.ppf(1 - alpha / 2)
        z_beta = sp_stats.norm.ppf(power)
        n_per_group = int(np.ceil(((z_alpha + z_beta) / effect_size) ** 2))
    else:
        raise ValueError(f"Unsupported test type: {test_type}")

    result = {
        "test_type": test_type,
        "effect_size": effect_size,
        "alpha": alpha,
        "power": power,
        "n_per_group": n_per_group,
        "total_n": n_per_group * 2 if "two" in test_type else n_per_group,
    }

    print(f"  検出力分析:")
    print(f"    効果量 d = {effect_size}, α = {alpha}, 検出力 = {power}")
    print(f"    → 必要サンプルサイズ: {result['n_per_group']}/群 (合計 {result['total_n']})")

    return result
```

### 5.4 仮説サマリー JSON 生成

```python
def generate_hypothesis_summary(hypothesis, test_results, verdict,
                                 elapsed, output_path=None):
    """
    仮説検証結果を含む analysis_summary.json を生成する。
    """
    import datetime

    summary = {
        "experiment": "Hypothesis-Driven Analysis",
        "timestamp": datetime.datetime.now().isoformat(),
        "elapsed_seconds": round(elapsed, 2),
        "environment": {
            "python": __import__("sys").version,
            "seed": SEED,
        },
        "hypothesis": {
            "framework": hypothesis["framework"],
            "population": hypothesis["population"],
            "intervention_or_exposure": hypothesis["intervention_or_exposure"],
            "comparison": hypothesis["comparison"],
            "outcome": hypothesis["outcome"],
            "H1": hypothesis["H1"],
            "H0": hypothesis["H0"],
            "alpha": hypothesis["alpha"],
        },
        "results": {
            "test_name": test_results.get("test"),
            "statistic": test_results.get("statistic"),
            "p_value": test_results.get("p_value"),
            "effect_size": test_results.get("cohens_d"),
        },
        "verdict": {
            "decision": verdict["verdict"],
            "evidence": verdict["evidence"],
            "effect_interpretation": verdict["effect_interpretation"],
            "interpretation": verdict["interpretation"],
        },
    }

    if output_path is None:
        output_path = RESULTS_DIR / "analysis_summary.json"

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False, default=str)

    print(f"  → Summary saved: {output_path}")
    return summary
```

## 6. プロンプト例と生成パイプライン対応表

| プロンプト例 | 生成される仮説 | 使用スキル |
|---|---|---|
| 「熱処理温度が合金の硬さに与える影響を調べたい」 | H₁: 熱処理温度は硬さに有意な影響を与える | pipeline-scaffold + eda + statistical-testing + doe |
| 「遺伝子発現データからがんのサブタイプを分類したい」 | H₁: 遺伝子発現パターンによりサブタイプを区別できる | pipeline-scaffold + preprocessing + pca-tsne + ml-classification |
| 「新薬の投与量と効果の関係を最適化したい」 | H₁: 投与量と効果の間に有意な用量応答関係がある | pipeline-scaffold + doe + process-optimization + ml-regression |
| 「患者の生存率に影響する因子を特定したい」 | H₁: 特定の臨床因子は生存率に有意な影響を持つ | pipeline-scaffold + survival-clinical + feature-importance |
| 「スペクトルデータから材料の組成を予測したい」 | H₁: スペクトル特徴量から組成を高精度で予測できる | pipeline-scaffold + spectral-signal + ml-regression |
| 「メタボロームデータで疾患群と健常群を比較したい」 | H₁: 疾患群と健常群で代謝物プロファイルに有意差がある | pipeline-scaffold + metabolomics + statistical-testing + pca-tsne |

## 7. 複数仮説の管理

```python
def manage_hypotheses(hypotheses_list):
    """
    複数仮説を優先順位付けして管理する。

    hypotheses_list: [
        {"id": "H1a", "description": "...", "priority": "primary",
         "test_type": "two_sample_t", "variables": ("X", "Y")},
        {"id": "H1b", "description": "...", "priority": "secondary", ...},
    ]
    """
    # 優先順位でソート
    priority_order = {"primary": 0, "secondary": 1, "exploratory": 2}
    sorted_h = sorted(hypotheses_list,
                       key=lambda h: priority_order.get(h["priority"], 99))

    print("=== 仮説一覧 ===")
    for h in sorted_h:
        print(f"  [{h['priority'].upper()}] {h['id']}: {h['description']}")

    # 多重比較補正の適用判定
    n_tests = len([h for h in sorted_h if h["priority"] != "exploratory"])
    if n_tests > 1:
        corrected_alpha = 0.05 / n_tests  # Bonferroni
        print(f"\n  ⚠ {n_tests} 個の検定 → Bonferroni 補正: α' = {corrected_alpha:.4f}")
        print(f"    または FDR (Benjamini-Hochberg) 補正を推奨")

    return sorted_h
```

## ToolUniverse 連携

| TU Key | ツール名 | 連携内容 |
|--------|---------|--------|
| `open_alex` | OpenAlex | 仮説関連文献の網羅的検索 |

## References

### Output Files

| ファイル | 形式 | 生成タイミング |
|---|---|---|
| `docs/hypothesis.md` | 仮説定義書（Markdown） | Phase 2 完了時 |
| `docs/hypothesis.json` | 仮説定義（JSON） | Phase 2 完了時 |
| `docs/workflow_design.md` | ワークフロー設計書（Markdown） | Phase 3 完了時 |
| `docs/workflow_design.json` | ワークフロー設計（JSON） | Phase 3 完了時 |
| `exp_analysis.py` | 仮説駆動パイプラインスクリプト | Phase 4 完了時 |
| `results/analysis_summary.json` | 仮説検証結果を含む JSON サマリー | 実行完了時 |
| `figures/*.png` | 解析結果の図表 | 実行完了時 |
| `results/hypothesis_tests.csv` | 検定結果一覧 | 実行完了時 |
| `results/power_analysis.csv` | 検出力分析結果 | 実行完了時 |

### 参照スキル

| スキル | 役割 |
|---|---|
| `scientific-pipeline-scaffold` | パイプラインの足場（ディレクトリ構造・ログ・サマリー） |
| `scientific-data-preprocessing` | データ品質チェック・前処理 |
| `scientific-eda-correlation` | 探索的データ解析・相関分析 |
| `scientific-statistical-testing` | 仮説検定・多重比較 |
| `scientific-ml-regression` | 回帰モデル（仮説が回帰型の場合） |
| `scientific-ml-classification` | 分類モデル（仮説が分類型の場合） |
| `scientific-publication-figures` | 論文品質の図表生成 |
| `scientific-academic-writing` | 論文執筆（仮説検証結果の論文化） |
| `scientific-critical-review` | 論文草稿の批判的レビュー（仮説と結論の整合性検証） |

```
