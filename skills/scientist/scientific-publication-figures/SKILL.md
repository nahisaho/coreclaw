---
name: scientific-publication-figures
description: |
  論文品質（Nature/Science/Cell レベル）の科学図表を作成するスキル。matplotlib rcParams 設定、
  DPI 300、spines 制御、カラーパレット選択、マルチパネル構成を行う際に使用。
  Scientific Skills Exp-10 で確立し、Exp-11〜13 で継承したパターン。
tu_tools:
  - key: biotools
    name: bio.tools
    description: 可視化ツールレジストリ検索
---

# Scientific Publication-Quality Figure Generation

Nature/Science/Cell 掲載レベルの科学図表を matplotlib/seaborn で作成するスキル。
Exp-10 で確立した 15 種の図表テンプレートと、全実験に共通するスタイル設定を提供する。

## When to Use

- 論文投稿用の高品質図表を作成するとき
- 複数パネルの composite figure を構成するとき
- DPI 300 以上、適切なフォントサイズ・カラーパレットが必要なとき
- 図表がジャーナルのスタイルガイドに準拠する必要があるとき

## Quick Start

## グローバルスタイル設定

以下の設定をスクリプトの冒頭で必ず適用する。

```python
import matplotlib.pyplot as plt
import matplotlib as mpl

def setup_publication_style():
    """Nature/Science 品質の matplotlib rcParams を設定する。"""
    plt.rcParams.update({
        # フォント
        "font.family": "sans-serif",
        "font.sans-serif": ["Noto Sans CJK JP", "IPAGothic", "Arial", "Helvetica", "DejaVu Sans"],
        "font.size": 10,
        "axes.titlesize": 12,
        "axes.labelsize": 11,
        "xtick.labelsize": 9,
        "ytick.labelsize": 9,
        "legend.fontsize": 9,

        # 線・マーカー
        "axes.linewidth": 1.2,
        "lines.linewidth": 1.5,
        "lines.markersize": 6,

        # スパイン
        "axes.spines.top": False,
        "axes.spines.right": False,

        # グリッド
        "axes.grid": False,

        # 保存設定
        "savefig.dpi": 300,
        "savefig.bbox": "tight",
        "savefig.transparent": False,

        # Figure 背景
        "figure.facecolor": "white",
        "axes.facecolor": "white",
    })
```

## カラーパレット

```python
# Nature-inspired パレット（Exp-10）
NATURE_PALETTE = [
    "#E64B35",  # 赤
    "#4DBBD5",  # 水色
    "#00A087",  # 緑
    "#3C5488",  # 紺
    "#F39B7F",  # サーモン
    "#8491B4",  # グレー青
    "#91D1C2",  # ミント
    "#DC9C6D",  # オレンジ
]

# 材料・群カテゴリ用
MATERIAL_PALETTE = {
    "Set2": "seaborn Set2（最大 8 色、差別化しやすい）",
    "tab10": "matplotlib tab10（最大 10 色）",
    "Paired": "seaborn Paired（最大 12 色、対比較向き）",
}

# 連続値用
CONTINUOUS_CMAPS = {
    "viridis": "知覚均一（デフォルト推奨）",
    "RdBu_r": "相関ヒートマップ（中心=0）",
    "YlOrRd": "単方向の強度（密度、温度）",
    "coolwarm": "二方向（応力の引張 vs 圧縮）",
}
```

## 共通保存関数

```python
def save_fig(fig, filename, dpi=300, formats=("png",)):
    """図を指定された形式で保存する。"""
    for fmt in formats:
        filepath = f"figures/{filename}.{fmt}"
        fig.savefig(filepath, dpi=dpi, bbox_inches="tight",
                    facecolor="white", edgecolor="none")
    plt.close(fig)
```

## 主要図表テンプレート

### 1. Violin + Strip Plot（有意差付き）

```python
import seaborn as sns
from scipy import stats

def plot_violin_with_significance(df, x, y, pairs=None, figsize=(10, 6)):
    fig, ax = plt.subplots(figsize=figsize)
    sns.violinplot(data=df, x=x, y=y, palette=NATURE_PALETTE,
                   inner=None, alpha=0.3, ax=ax)
    sns.stripplot(data=df, x=x, y=y, palette=NATURE_PALETTE,
                  size=3, alpha=0.5, ax=ax)

    # 有意差ブラケット（pairs 指定時）
    if pairs:
        y_max = df[y].max()
        for i, (g1, g2) in enumerate(pairs):
            d1 = df[df[x] == g1][y]
            d2 = df[df[x] == g2][y]
            stat, pval = stats.mannwhitneyu(d1, d2)
            stars = "***" if pval < 0.001 else "**" if pval < 0.01 else "*" if pval < 0.05 else "ns"
            h = y_max * (1.05 + i * 0.08)
            # ブラケット描画は adjustText か手動 annotate
            ax.text((list(df[x].unique()).index(g1) +
                    list(df[x].unique()).index(g2)) / 2,
                   h, stars, ha="center", fontsize=12, fontweight="bold")
    save_fig(fig, f"violin_{y}")
```

### 2. Forest Plot（メタ分析風）

```python
def plot_forest(effects, ci_lower, ci_upper, labels, figsize=(10, 8)):
    fig, ax = plt.subplots(figsize=figsize)
    y_pos = range(len(labels))
    ax.errorbar(effects, y_pos, xerr=[np.array(effects) - np.array(ci_lower),
                np.array(ci_upper) - np.array(effects)],
                fmt="D", color=NATURE_PALETTE[0], markersize=8,
                capsize=4, linewidth=2)
    ax.axvline(0, color="gray", linestyle="--", linewidth=1)
    ax.set_yticks(y_pos)
    ax.set_yticklabels(labels)
    ax.set_xlabel("Effect Size")
    ax.set_title("Forest Plot", fontweight="bold")
    save_fig(fig, "forest_plot")
```

### 3. マルチパネル Composite Figure

```python
import matplotlib.gridspec as gridspec

def create_composite_figure(plot_functions, layout=(2, 3),
                            figsize=(18, 12), panel_labels=True):
    """
    複数の描画関数を composite figure にまとめる。
    plot_functions: [(func, kwargs), ...] のリスト
    """
    fig = plt.figure(figsize=figsize)
    gs = gridspec.GridSpec(*layout, figure=fig, hspace=0.35, wspace=0.3)

    for i, (func, kwargs) in enumerate(plot_functions):
        row, col = divmod(i, layout[1])
        ax = fig.add_subplot(gs[row, col])
        func(ax=ax, **kwargs)

        if panel_labels:
            ax.text(-0.1, 1.1, chr(65 + i),  # A, B, C, ...
                   transform=ax.transAxes, fontsize=16,
                   fontweight="bold", va="top")

    save_fig(fig, "composite_figure")
```

## 図のサイズガイドライン

| 用途 | サイズ (inches) | 備考 |
|---|---|---|
| 1 カラム | (3.5, 3.0) | Nature 1 カラム幅 ≈ 89 mm |
| 1.5 カラム | (5.5, 4.0) | 中間サイズ |
| 2 カラム | (7.0, 5.0) | Nature 2 カラム幅 ≈ 183 mm |
| フルページ | (7.0, 9.0) | A4 の余白を除いた高さ |

## ToolUniverse 連携

| TU Key | ツール名 | 連携内容 |
|--------|---------|--------|
| `biotools` | bio.tools | 可視化ツールレジストリ検索 |

## References

### Output Files

| ファイル | 形式 |
|---|---|
| `figures/*.png` | PNG (300 DPI) |
| `figures/*.svg` | SVG（ベクター、投稿用） |
| `figures/*.pdf` | PDF（ベクター、LaTeX 用） |

#### 参照実験

- **Exp-10**: 15 種の図表テンプレートの完全セット
- **Exp-11〜13**: rcParams 設定とカラーパレットの継承
