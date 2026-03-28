# CoreClaw デモ用プロンプト 10選
## エネルギー新物質探索 — 仮説生成 × 実験計画
### Scientist スキル特化・SATORI 190スキル フル活用版

> **コンセプト**: AI が [SATORI](https://github.com/nahisaho/satori) の 190 スキルを駆使して
> **論文 NER → 知識グラフ構築 → ギャップ分析 → 仮説生成 → DOE 実験設計 → 計算検証** の
> 一気通貫パイプラインを実行するライブデモ。
>
> **論文検索は [ToolUniverse](https://github.com/mims-harvard/ToolUniverse) MCP 経由**で 15 の学術データベースにアクセス:
> | ToolUniverse ツール | 分野 | 化学・材料科学での用途 |
> |---|---|---|
> | `openalex_literature_search` | 全分野（2.5億件+） | 網羅的横断検索（主導ツール） |
> | `SemanticScholar_search_papers` | 全分野・AI 類似論文 | 引用グラフ・著者ネットワーク分析 |
> | `ArXiv_search_papers` | 物理・材料・ CS（プレプリント） | 未走論文・凝縮系物理 |
> | `EuropePMC_search_articles` | バイオメディカル（3,900万件+） | PRISMA 系統的レビュー |
> | `Crossref_search_works` | 全分野・DOI メタ | 参考文献メタデータ補完 |
>
> **活用する主要 SATORI スキル**:
> | SATORI スキル | カテゴリ | プロンプトでの用途 |
> |---|---|---|
> | `text-mining-nlp` (#66) | Z. テキストマイニング | BioBERT NER → 知識グラフ構築（Louvain） |
> | `literature-search` (#78) | I. 文献検索 | **ToolUniverse MCP** 経由: `openalex_literature_search` / `SemanticScholar_search_papers` / `ArXiv_search_papers` 横断検索 |
> | `hypothesis-pipeline` (#6) | A. 基盤 | PICO/PECO 仮説構造化 + パイプライン自動生成 |
> | `doe` (#20) | D. 実験計画 | 田口直交表・CCD・LHS・ANOVA・ベイズ最適化 |
> | `process-optimization` (#21) | D. プロセス最適化 | ML-RSM 応答曲面法・パレート最適化 |
> | `adaptive-experiments` (#190) | D. 適応実験 | Thompson Sampling・SPRT 逐次検定 |
> | `computational-materials` (#70) | G. 計算材料 | pymatgen 結晶構造・Materials Project・相図・バンド構造 |
> | `graph-neural-networks` (#52) | R. GNN | PyG 分子/結晶特性予測・Scaffold Split |
> | `bayesian-statistics` (#53) | R. ベイズ統計 | PyMC 階層ベイズ・MCMC・ベイズ最適化 |
> | `uncertainty-quantification` (#171) | R. 不確実性定量化 | Conformal Prediction・MC Dropout・Calibration |
> | `explainable-ai` (#54) | R. 説明可能AI | SHAP/LIME 特徴量寄与・反実仮想説明 |
> | `active-learning` (#167) | C. 能動学習 | 不確実性サンプリング・バッチ AL ループ |
> | `network-visualization` (#181) | B. ネットワーク可視化 | NetworkX KG 可視化・Louvain コミュニティ |
> | `symbolic-mathematics` (#105) | B. 記号数学 | SymPy 解析モデル・ODE 記述 |
> | `materials-characterization` (#31) | G. 材料特性評価 | XRD Scherrer・Tauc プロット |
> | `deep-chemistry` (#115) | G. 深層化学 | DeepChem GCN/MPNN 分子特性予測 |
> | `md-simulation` (#112) | G. MD シミュレーション | MDAnalysis 分子動力学 |
> | `systems-biology` (#63) | W. システム生物学 | Sobol 感度解析 |
> | `data-simulation` (#3) | A. データシミュレーション | 物理ベース合成データ生成 |
> | `publication-figures` (#4) | A. 論文品質図表 | matplotlib rcParams・マルチパネル |
> | `feature-importance` (#19) | C. 特徴量重要度 | SHAP/Permutation 重要度 |
> | `research-methodology` (#47) | O. 研究方法論 | SCAMPER/TRIZ・研究デザインマトリクス |

---

### プロンプト 1: 次世代固体電解質の新規組成仮説

```
あなたは新物質探索型の仮説発見AIです。

## 分野
エネルギー材料（全固体電池）

## 課題
Microsoft + PNNL は 3,260万候補から固体電解質 N2116（Li+Na系、Li使用量70%削減）を発見しました。しかし N2116 のイオン伝導度は実用水準（10⁻³ S/cm 以上）にまだ課題が残ります。N2116 を超える次世代固体電解質の新規組成を仮説として提案してください。

## 分析手法
- **文献深層調査**（**ToolUniverse MCP** `openalex_literature_search` / `SemanticScholar_search_papers` / `ArXiv_search_papers`）: 固体電解質に関する主要論文 30 本以上を横断検索し、エビデンス階層を評価
- **知識グラフ構築**（`text-mining-nlp` BioBERT NER + Louvain コミュニティ検出）: 論文から「組成—構造—伝導メカニズム—性能」のノード・エッジ関係を自動抽出し、知識グラフを構築。NetworkX で可視化（`network-visualization`）
- **ギャップ分析**: 知識グラフ上でエッジが欠損している組成-構造ペア（＝未探索領域）を特定し、仮説の種とする
- **計算材料科学検証**（`computational-materials` pymatgen）: 提案組成の結晶構造を Materials Project データと照合し、相図・バンド構造/DOS を計算
- **LHS 実験設計**（`doe` LatinHypercube）: 組成空間（Li/Na比、アニオン種比、焼結温度、焼結時間）を因子とした LHS 初期設計（N=20 点）を作成
- **ベイズ最適化**（`bayesian-statistics` PyMC + `adaptive-experiments`）: LHS 初期データ取得後の逐次探索戦略（獲得関数: Expected Improvement、Thompson Sampling 併用）を設計

## 調査指示
1. **ToolUniverse** の `openalex_literature_search`・`SemanticScholar_search_papers`・`ArXiv_search_papers` で固体電解質の文献を横断検索（各 50 件以上）し、`text-mining-nlp` で NER → 関係抽出 → 知識グラフを構築。ノード一覧とエッジ関係をテーブルで出力
2. 知識グラフのギャップ分析（Louvain コミュニティ間の欠損エッジ列挙）により、「探索価値の高い未知領域」を 5 件以上特定
3. `hypothesis-pipeline` PICO 構造で仮説を 3 件以上定式化。`computational-materials` pymatgen で各仮説の擬三元系相図上の安定性を評価
4. `doe` で LHS 実験設計を Python コードとして生成（scipy.stats.qmc.LatinHypercube、因子 4、水準 20 点）
5. `bayesian-statistics` PyMC + `adaptive-experiments` Thompson Sampling で LHS → BO 移行基準と逐次探索プロトコルを設計

## 出力
- `results/knowledge_graph.json` — 知識グラフ（ノード・エッジ構造、Louvain コミュニティ）
- `figures/knowledge_graph.png` — 知識グラフ可視化（NetworkX）
- `docs/hypothesis.json` — PICO 構造化仮説リスト（予測伝導度、相安定性評価付き）
- `figures/phase_diagram.png` — pymatgen 擬三元系相図
- `results/lhs_design.csv` — LHS 実験設計マトリックス（20 点）
- `protocols/bo_protocol.py` — BO 逐次探索プロトコル（Python コード）
- `results/literature_search.csv` — 参考文献リスト
- **`report.md`** — 全分析プロセスと結果を統合した総合レポート（文献調査結果、知識グラフ分析、ギャップ分析、仮説一覧、実験計画、図表の説明を含む Markdown 形式）

**最重要**: `report.md`（総合レポート）を必ず最初に作成し、全分析結果を統合してください。その他の成果物もすべてファイルとして保存してください。
```

---

### プロンプト 2: コバルトフリー正極材料の逆設計仮説

```
あなたは新物質探索型の仮説発見AIです。

## 分野
エネルギー材料（リチウムイオン電池正極）

## 課題
現行の高エネルギー密度正極材料（NMC811, NCA）はコバルトに依存しており、資源リスクとコストが課題です。コバルトを完全に排除しつつ NMC811（200 mAh/g 以上）と同等のエネルギー密度を持つ新規正極材料を仮説として提案してください。

## 分析手法
- **文献深層調査**（**ToolUniverse MCP** `openalex_literature_search` / `SemanticScholar_search_papers` / `ArXiv_search_papers`）
- **知識グラフ構築**（`text-mining-nlp` BioBERT NER）: 「元素—結晶構造—電気化学特性—劣化モード」のグラフ。Co の役割（層状構造安定化、Li/Ni 混排抑制）をエッジとして明示
- **パレートフロント分析**（`process-optimization` ML-RSM パレート最適化）: 容量 vs サイクル寿命 vs コストの 3 目的最適化
- **GNN 物性予測**（`graph-neural-networks` PyG GCN）: 結晶構造グラフから容量・サイクル安定性を予測するモデルを設計
- **LHS 実験設計**（`doe`）: 遷移金属比（Ni/Mn/Fe/Ti/V）を因子とした 5 因子 LHS（N=25）
- **SHAP 特徴量解析**（`explainable-ai`）: GNN/ML モデルの予測に対し、各元素・構造パラメータの寄与を SHAP で可視化

## 調査指示
1. **ToolUniverse** の `openalex_literature_search`・`SemanticScholar_search_papers`・`ArXiv_search_papers` で正極材料の文献を横断検索し、`text-mining-nlp` で知識グラフを構築し Mermaid 図で可視化
2. Co 除去で欠損するエッジ（機能）を列挙。`research-methodology` SCAMPER 法で代替元素/構造の発想を支援
3. `process-optimization` で既存材料（NMC811, LFP, LNMO, Li-rich, DRX）のパレートフロント（容量-寿命-コスト）を構築
4. `graph-neural-networks` PyG GCN で結晶構造→電気化学特性の予測モデルを設計し、パレートフロント外の仮説を 3 件以上提案
5. `doe` LHS 設計 + `explainable-ai` SHAP 分析テンプレートを出力

## 出力
- `results/knowledge_graph.json` + `figures/knowledge_graph_mermaid.md` — 知識グラフ
- `figures/pareto_front.png` — パレートフロント（既存材料 + 仮説位置）
- `docs/hypothesis.json` — PICO 構造化仮説リスト
- `results/gnn_predictions.json` — GNN 特性予測結果
- `figures/shap_summary.png` — SHAP 特徴量寄与図
- `results/lhs_design.csv` — LHS 25 条件マトリックス
- **`report.md`** — 全分析プロセスと結果を統合した総合レポート（文献調査結果、知識グラフ分析、パレートフロント分析、GNN予測、仮説一覧、実験計画、図表の説明を含む Markdown 形式）

**最重要**: `report.md`（総合レポート）を必ず最初に作成し、全分析結果を統合してください。その他の成果物もすべてファイルとして保存してください。
```

---

### プロンプト 3: ペロブスカイト太陽電池の耐久性向上材料仮説

```
あなたは新物質探索型の仮説発見AIです。

## 分野
エネルギー材料（太陽電池）

## 課題
ペロブスカイト太陽電池は効率 26% 超を達成しましたが、水分・熱・光に対する長期安定性が商用化の最大障壁です。ABX₃ 構造の A/B/X サイトの組成改変により、効率 24% 以上を維持しつつ 85°C/85%RH で 1,000 時間以上安定な新規ペロブスカイト組成を仮説として提案してください。

## 分析手法
- **文献深層調査**（**ToolUniverse MCP** `openalex_literature_search` / `SemanticScholar_search_papers` / `ArXiv_search_papers`）
- **知識グラフ構築**（`text-mining-nlp`）: 「A/B/X サイト組成—バンドギャップ—効率—劣化モード—安定性」の多層知識グラフ。BERTopic でトピッククラスタリング
- **応答曲面法**（`process-optimization` ML-RSM + `doe` CCD）: A サイト混合比（FA/Cs/Rb）を制御因子とした Central Composite Design + 2 次回帰モデル
- **パレートフロント分析**（`process-optimization`）: 効率 vs 安定性のトレードオフ曲線
- **不確実性定量化**（`uncertainty-quantification` Conformal Prediction）: RSM 予測値に対する信頼区間
- **バンド構造計算**（`computational-materials` pymatgen）: 提案組成のバンドギャップ・形成エネルギー検証

## 調査指示
1. **ToolUniverse** の `openalex_literature_search`・`SemanticScholar_search_papers`・`ArXiv_search_papers` でペロブスカイト太陽電池の文献を横断検索し、`text-mining-nlp` BERTopic でトピック分析 + NER → 知識グラフ構築
2. 知識グラフ上で「効率 > 24%」ノードと「安定性 > 1,000h」ノードを同時接続する経路のギャップを探索
3. `doe` CCD 設計（因子: FA比, Cs比, Rb比, Cl比）を作成。`process-optimization` ML-RSM で 2 次回帰モデルを構築し、`uncertainty-quantification` で予測区間を付与
4. 効率-安定性のパレートフロントを描画し、フロント突破仮説を `hypothesis-pipeline` PICO で 3 件以上定式化
5. `computational-materials` pymatgen で仮説組成のバンド構造・フォノン安定性を事前検証

## 出力
- `results/knowledge_graph.json` + `results/topic_model.json` — 知識グラフ + BERTopic トピック
- `results/doe_ccd_design.csv` — CCD 実験設計マトリックス
- `results/rsm_model.json` — RSM 回帰モデル（係数 + R² + 最適組成予測 ± CI）
- `figures/pareto_front.png` — パレートフロント（既存材料 + 仮説位置）
- `figures/band_structure.png` — 提案組成のバンド構造図
- `docs/hypothesis.json` — PICO 構造化仮説リスト
- **`report.md`** — 全分析プロセスと結果を統合した総合レポート（文献調査結果、トピック分析、RSM モデル、パレートフロント、バンド構造、仮説一覧、実験計画を含む Markdown 形式）

**最重要**: `report.md`（総合レポート）を必ず最初に作成し、全分析結果を統合してください。その他の成果物もすべてファイルとして保存してください。
```

---

### プロンプト 4: 希少金属フリー水電解触媒の新規組成仮説

```
あなたは新物質探索型の仮説発見AIです。

## 分野
エネルギー材料（グリーン水素製造触媒）

## 課題
水電解の酸素発生反応（OER）触媒は IrO₂/RuO₂ に依存しており、Ir の地殻存在度は 0.001 ppm と極めて希少です。地殻存在度上位 20 元素のみで構成され、OER 過電圧 300 mV 以下（10 mA/cm² 時）を達成する新規触媒材料を仮説として提案してください。

## 分析手法
- **文献深層調査**（**ToolUniverse MCP** `openalex_literature_search` / `SemanticScholar_search_papers` / `ArXiv_search_papers`）
- **知識グラフ構築**（`text-mining-nlp`）: 「元素—電子構造（d バンド中心, eg 占有数）—結晶構造—OER 活性—安定性」のグラフ
- **DeepChem 分子特性予測**（`deep-chemistry` GCN/AttentiveFP）: 触媒候補の吸着エネルギー予測モデルを構築
- **SHAP 説明可能性**（`explainable-ai`）: DeepChem 予測に対する元素・構造記述子の寄与を SHAP で可視化
- **不確実性定量化**（`uncertainty-quantification` MC Dropout）: 記述子値の 95% 信頼区間、火山プロット頂点近傍に位置する確率を算出
- **LHS 実験設計**（`doe`）: 電着法の合成パラメータ（金属塩濃度比、pH、電位、温度）を因子とした LHS（N=16）
- **能動学習ループ**（`active-learning`）: 不確実性サンプリングで次実験候補を自動選定

## 調査指示
1. **ToolUniverse** の `openalex_literature_search`・`SemanticScholar_search_papers`・`ArXiv_search_papers` で OER 触媒の文献を横断検索し、`text-mining-nlp` NER + 関係抽出で知識グラフを構築し、火山プロット上の材料マッピングを生成
2. `deep-chemistry` DeepChem AttentiveFP で結晶構造→吸着エネルギー予測モデルを設計。`explainable-ai` SHAP で記述子寄与を分析
3. `uncertainty-quantification` MC Dropout で予測の 95% CI を付与。火山プロット頂点付近の候補をスクリーニング
4. `hypothesis-pipeline` PICO で仮説 3 件以上を定式化。`doe` LHS 16 点の実験設計を作成
5. `active-learning` 不確実性サンプリングによる逐次実験選定プロトコルを策定

## 出力
- `results/knowledge_graph.json` — 知識グラフ（元素-電子構造-活性）
- `results/gnn_predictions.json` — DeepChem 吸着エネルギー予測結果
- `figures/shap_summary.png` — SHAP 記述子寄与図
- `figures/volcano_plot_uq.png` — UQ 付き火山プロット（既存材料 + 仮説材料）
- `docs/hypothesis.json` — PICO 仮説リスト
- `results/lhs_design.csv` — LHS 16 条件マトリックス
- `protocols/active_learning_loop.py` — 能動学習プロトコル
- **`report.md`** — 全分析プロセスと結果を統合した総合レポート（文献調査結果、知識グラフ分析、DeepChem予測、SHAP分析、火山プロット、仮説一覧、実験計画を含む Markdown 形式）

**最重要**: `report.md`（総合レポート）を必ず最初に作成し、全分析結果を統合してください。その他の成果物もすべてファイルとして保存してください。
```

---

### プロンプト 5: 水素貯蔵材料の新規組成仮説

```
あなたは新物質探索型の仮説発見AIです。

## 分野
エネルギー材料（水素貯蔵）

## 課題
車載用水素貯蔵は 700 気圧の高圧タンクが主流ですが、重量・体積密度に限界があります。DOE 目標（重量密度 6.5 wt%、体積密度 50 g-H₂/L、動作温度 -40〜85°C）を達成する新規固体水素貯蔵材料を仮説として提案してください。

## 分析手法
- **文献深層調査**（**ToolUniverse MCP** `openalex_literature_search` / `SemanticScholar_search_papers` / `ArXiv_search_papers`）
- **知識グラフ構築**（`text-mining-nlp` + `network-visualization` NetworkX）: 「組成—結晶構造—脱水素エンタルピー—速度論—可逆性—重量密度—体積密度」
- **田口直交表**（`doe` L18）: 因子（主水素化物種、触媒種、触媒添加量、ボールミル時間、焼結温度、雰囲気）を直交表で設計し、SN 比分析
- **SymPy 熱力学モデリング**（`symbolic-mathematics`）: van't Hoff 式による脱水素エンタルピーと平衡温度の解析的関係を導出
- **MD シミュレーション設計**（`md-simulation`）: 水素拡散係数の温度依存性をシミュレーションするプロトコル
- **ベイズ最適化**（`bayesian-statistics` + `adaptive-experiments` Thompson Sampling）: 田口法で絞り込んだ有望領域内での逐次探索

## 調査指示
1. **ToolUniverse** の `openalex_literature_search`・`SemanticScholar_search_papers`・`ArXiv_search_papers` で水素貯蔵材料の文献を横断検索し、`text-mining-nlp` で知識グラフ構築、DOE 4 目標の同時達成経路の欠損を分析
2. `symbolic-mathematics` SymPy で van't Hoff 式に基づく脱水素温度-エンタルピー関係を解析的に導出し、目標温度範囲の熱力学的要件を明確化
3. 反応性水素化物複合体（RHC）の仮説を `hypothesis-pipeline` PICO で 3 件以上定式化
4. `doe` 田口直交表 L18 設計（因子 6、水準 3）を出力。SN 比「望大特性」での最適水準推定テンプレートを提供
5. `md-simulation` MDAnalysis による水素拡散シミュレーション設計 + `bayesian-statistics` BO への移行計画を策定

## 出力
- `results/knowledge_graph.json` — 知識グラフ（DOE 目標達成度マッピング）
- `results/vanthoff_analysis.py` — SymPy 熱力学解析コード
- `docs/hypothesis.json` — PICO 仮説リスト
- `results/taguchi_l18.csv` — 田口 L18 直交表（18 条件 + SN 比テンプレート）
- `protocols/md_hydrogen_diffusion.py` — MD シミュレーションプロトコル
- `protocols/bo_protocol.py` — BO 逐次探索プロトコル
- **`report.md`** — 全分析プロセスと結果を統合した総合レポート（文献調査結果、知識グラフ分析、熱力学解析、仮説一覧、田口直交表、MDシミュレーション計画を含む Markdown 形式）

**最重要**: `report.md`（総合レポート）を必ず最初に作成し、全分析結果を統合してください。その他の成果物もすべてファイルとして保存してください。
```

---

### プロンプト 6: 熱電材料の新規組成仮説

```
あなたは新物質探索型の仮説発見AIです。

## 分野
エネルギー材料（熱電変換・廃熱回収）

## 課題
産業廃熱（200-600°C）の 60% 以上が未利用です。この温度域で ZT > 2.0 を達成し、かつ毒性元素（Pb, Te, Se）を含まない新規熱電材料を仮説として提案してください。

## 分析手法
- **文献深層調査**（**ToolUniverse MCP** `SemanticScholar_search_papers`（引用グラフ分析）+ `openalex_literature_search` / `ArXiv_search_papers`）
- **知識グラフ構築**（`text-mining-nlp`）: 「組成—バンド構造—フォノン散乱機構—ゼーベック係数—格子熱伝導率—ZT—動作温度」
- **バンド構造計算**（`computational-materials` pymatgen）: 仮説材料のバンド構造/DOS を計算
- **Sobol 感度分析**（`systems-biology` Sobol 指数）: ZT を目的変数とした各組成因子の寄与率を定量化
- **LHS 実験設計**（`doe`）: 高エントロピー組成（5 元素モル比 + 焼結温度 + 焼結圧力）の 7 因子 LHS（N=30）
- **能動学習**（`active-learning` バッチ AL）: LHS 初期データ後の効率的な追加実験選定
- **論文品質図表**（`publication-figures`）: Ashby プロット（S vs κ_lat + ZT 等値線）

## 調査指示
1. **ToolUniverse** の `SemanticScholar_search_papers`（引用ネットワーク分析）・`openalex_literature_search`・`ArXiv_search_papers` で熱電材料の文献を横断検索し、`text-mining-nlp` で知識グラフ構築
2. 知識グラフ上で「毒性フリー × ZT > 2.0 × 200-600°C」のパス欠損を分析
3. `publication-figures` で Ashby プロット（S vs κ_lat）を作成し ZT = 2.0 等値線を描画。`computational-materials` で仮説材料のバンド構造を計算
4. `systems-biology` Sobol 感度解析で ZT 支配因子を特定。`hypothesis-pipeline` PICO で仮説 3 件以上を定式化
5. `doe` LHS 30 点設計 + `active-learning` バッチ AL プロトコル（バッチサイズ 5、停止基準: ZT 改善率 < 5%）を策定

## 出力
- `results/knowledge_graph.json` — 知識グラフ
- `figures/ashby_plot.png` — Ashby プロット（既存材料 + ZT 等値線 + 仮説位置）
- `figures/band_structure.png` — 仮説材料バンド構造
- `results/sobol_indices.json` — Sobol 感度分析結果
- `docs/hypothesis.json` — PICO 仮説リスト
- `results/lhs_design.csv` — LHS 30 点マトリックス
- `protocols/active_learning_batch.py` — バッチ能動学習プロトコル
- **`report.md`** — 全分析プロセスと結果を統合した総合レポート（文献調査結果、知識グラフ分析、Ashbyプロット、Sobol感度分析、バンド構造、仮説一覧、実験計画を含む Markdown 形式）

**最重要**: `report.md`（総合レポート）を必ず最初に作成し、全分析結果を統合してください。その他の成果物もすべてファイルとして保存してください。
```

---

### プロンプト 7: 核融合炉壁材料の新規組成仮説

```
あなたは新物質探索型の仮説発見AIです。

## 分野
エネルギー材料

## 課題
核融合炉のプラズマ対向壁は、1,000°C 以上の高温、14 MeV 中性子照射、高粒子束に同時に曝されます。現行候補の W 合金は脆性破壊が課題、RAFM 鋼はスウェリングが限界です。これらを超える新規プラズマ対向壁材料を仮説として提案してください。

## 課題の制約条件
- 使用温度: 800-1,200°C / 中性子照射量: > 50 dpa / 熱伝導率: > 30 W/m·K / 低放射化

## 分析手法（SATORI スキル活用）
- **文献深層調査**（`systematic-review` PRISMA 2020 + **ToolUniverse MCP** `openalex_literature_search` / `SemanticScholar_search_papers` / `EuropePMC_search_articles`）: 核融合材料の系統的レビューを PRISMA フローで実施
- **知識グラフ構築**（`text-mining-nlp` + `network-visualization`）: 照射損傷メカニズム（点欠陥 → クラスタリング → ボイド/ループ形成）の因果連鎖
- **相図計算**（`computational-materials` pymatgen）: HEA/MAX 相の擬三元系/四元系相図を CALPHAD 手法で評価
- **パレートフロント分析**（`process-optimization`）: 熱伝導率 vs DBTT vs 照射後膨張率の 3 目的最適化
- **LHS 実験設計**（`doe`）: HEA 5 元素 + アーク溶解パワー + 熱処理温度 = 7 因子 LHS（N=20）
- **MD シミュレーション**（`md-simulation`）: 照射欠陥形成シミュレーションの設計
- **データシミュレーション**（`data-simulation`）: 照射データの不足を補う物理ベース合成データ生成

## 調査指示
1. **ToolUniverse** の `openalex_literature_search`・`SemanticScholar_search_papers`・`EuropePMC_search_articles` で核融合材料の文献を横断検索し、`systematic-review` PRISMA 2020 プロトコルで系統的レビューを実施。`text-mining-nlp` で照射損傷因果チェーンの知識グラフを構築
2. `computational-materials` pymatgen で候補 HEA/MAX 相の相安定性を擬三元系相図で評価
3. `process-optimization` で既存材料のパレートフロント（熱伝導率 vs DBTT vs スウェリング率）を構築。フロント外側の設計空間を特定
4. `hypothesis-pipeline` PICO で仮説 3 件以上を定式化。`data-simulation` で照射データの物理ベース合成を設計
5. `doe` LHS 20 点設計 + `md-simulation` 照射欠陥シミュレーション計画を策定

## 出力
- `figures/prisma_flow.mmd` — PRISMA 2020 フロー図
- `results/knowledge_graph.json` — 照射損傷因果チェーン知識グラフ
- `figures/phase_diagram.png` — pymatgen 擬三元系相図
- `figures/pareto_front.png` — 3 目的パレートフロント
- `docs/hypothesis.json` — PICO 仮説リスト
- `results/lhs_design.csv` — LHS 20 条件マトリックス
- `protocols/md_irradiation.py` — MD 照射シミュレーションプロトコル
- **`report.md`** — 全分析プロセスと結果を統合した総合レポート（PRISMA系統的レビュー、知識グラフ分析、相図、パレートフロント、仮説一覧、実験計画を含む Markdown 形式）

**最重要**: `report.md`（総合レポート）を必ず最初に作成し、全分析結果を統合してください。その他の成果物もすべてファイルとして保存してください。
```

---

### プロンプト 8: CO₂ 電解還元触媒の新規組成仮説

```
あなたは新物質探索型の仮説発見AIです。

## 分野
エネルギー材料（CO₂ 回収・利用触媒）

## 課題
CO₂ 電解還元で C₂+ 生成物（エチレン、エタノール等）を高選択率で得ることが鍵です。現行 Cu 系触媒は C₂+ ファラデー効率 60-70% が上限で安定性にも課題があります。C₂+ FE > 80% かつ 500 時間安定な新規触媒を仮説として提案してください。

## 分析手法
- **文献深層調査**（**ToolUniverse MCP** `ArXiv_search_papers`（最新プレプリント）/ `SemanticScholar_search_papers` / `openalex_literature_search`）
- **知識グラフ構築**（`text-mining-nlp` + `biomedical-pubtator` エンティティ抽出）: 反応経路ネットワーク（*CO 二量化 vs *CHO 水素化の分岐点）
- **DeepChem 特性予測**（`deep-chemistry` MPNN）: 結合エネルギー予測
- **Sobol 感度分析**（`systems-biology`）: 組成因子（Cu比, 第二金属, 形態, pH）が C₂+ 選択性に与える一次・全次 Sobol 指数
- **SHAP 説明可能性**（`explainable-ai`）: 予測モデルの記述子寄与
- **不確実性定量化**（`uncertainty-quantification` Conformal Prediction）: FE 予測の 90% CI
- **適応的実験**（`adaptive-experiments` SPRT 逐次検定）: スクリーニング段階でのGo/No-Go判定

## 調査指示
1. **ToolUniverse** の `ArXiv_search_papers`（最新プレプリント含む）・`SemanticScholar_search_papers`・`openalex_literature_search` で CO₂RR の文献を横断検索し、`text-mining-nlp` + `biomedical-pubtator` で反応経路ネットワーク型知識グラフを構築
2. `deep-chemistry` MPNN で *CO 結合エネルギー予測モデルを設計。`systems-biology` Sobol 解析で C₂+ 選択性の支配因子を特定
3. `explainable-ai` SHAP + `uncertainty-quantification` Conformal Prediction で UQ 付き記述子スクリーニング
4. `hypothesis-pipeline` PICO で仮説 3 件以上を定式化（各仮説の FE 予測 ± 90% CI）
5. `adaptive-experiments` SPRT で 2 段階実験プロトコル（RDE スクリーニング → フローセル詳細評価）の Go/No-Go 基準を設計

## 出力
- `results/knowledge_graph.json` — 反応経路ネットワーク知識グラフ
- `results/gnn_predictions.json` — DeepChem 結合エネルギー予測
- `results/sobol_indices.json` — Sobol 感度分析
- `figures/shap_summary.png` — SHAP 記述子寄与
- `docs/hypothesis.json` — PICO 仮説（FE ± 90% CI 付き）
- `protocols/sprt_screening.py` — SPRT Go/No-Go 判定プロトコル
- **`report.md`** — 全分析プロセスと結果を統合した総合レポート（文献調査結果、反応経路ネットワーク、DeepChem予測、Sobol分析、SHAP寄与、仮説一覧、実験プロトコルを含む Markdown 形式）

**最重要**: `report.md`（総合レポート）を必ず最初に作成し、全分析結果を統合してください。その他の成果物もすべてファイルとして保存してください。
```

---

### プロンプト 9: 高温超伝導線材の新規組成仮説

```
あなたは新物質探索型の仮説発見AIです。

## 分野
エネルギー材料（超伝導送電・核融合マグネット）

## 課題
REBCO（YBa₂Cu₃O₇₋δ 系）は液体窒素温度で動作可能ですが線材コストが銅線の 10-50 倍です。Tc > 77K・線材加工可能・コスト大幅低減の新規超伝導組成を仮説として提案してください。

## 分析手法
- **文献深層調査**（**ToolUniverse MCP** `SemanticScholar_search_papers`（引用グラフ + 著者ネットワーク）+ `openalex_literature_search` / `ArXiv_search_papers`）
- **知識グラフ構築**（`text-mining-nlp` BERTopic + NER）: 超伝導メカニズム分類（電子フォノン / スピンゆらぎ / 電荷移動）をトピックとしたクラスタリング
- **バンド構造・DOS 計算**（`computational-materials` pymatgen）: フェルミ面トポロジーとバンド充填率の評価
- **GNN 結晶特性予測**（`graph-neural-networks` PyG GIN）: 結晶構造から Tc を予測する GNN モデル設計
- **相図計算**（`computational-materials`）: 提案組成の常圧での相安定性を CALPHAD で評価
- **論文品質図表**（`publication-figures`）: Ashby プロット（Tc vs 線材コスト $/kA·m）

## 調査指示
1. **ToolUniverse** の `SemanticScholar_search_papers`（引用ネットワーク・著者ネットワーク）・`openalex_literature_search`・`ArXiv_search_papers` で超伝導体の文献を横断検索し、`text-mining-nlp` BERTopic で超伝導メカニズム別トピッククラスタリング + 知識グラフ構築
2. 知識グラフのギャップ分析: ニッケル酸化物系の高圧→常圧ギャップを特定。化学的プレ圧縮（内在的格子圧縮）アプローチの未探索経路を発見
3. `publication-figures` Ashby プロット作成。`computational-materials` pymatgen でバンド構造/DOS + 相安定性を計算
4. `graph-neural-networks` PyG GIN で結晶構造→Tc 予測モデルを設計し、常圧高 Tc 仮説を `hypothesis-pipeline` PICO で 3 件以上定式化
5. 高圧合成 → 常圧安定化のプロセスウィンドウを `doe` + `process-optimization` で探索設計

## 出力
- `results/knowledge_graph.json` + `results/topic_model.json` — メカニズム分類付き知識グラフ
- `figures/ashby_tc_cost.png` — Tc vs コスト Ashby プロット
- `figures/band_structure.png` + `figures/phase_diagram.png` — バンド構造 + 相図
- `results/gnn_predictions.json` — GNN Tc 予測結果
- `docs/hypothesis.json` — PICO 仮説リスト
- **`report.md`** — 全分析プロセスと結果を統合した総合レポート（文献調査結果、メカニズム分類、Ashbyプロット、バンド構造、GNN予測、仮説一覧を含む Markdown 形式）

**最重要**: `report.md`（総合レポート）を必ず最初に作成し、全分析結果を統合してください。その他の成果物もすべてファイルとして保存してください。
```

---

### プロンプト 10: SOEC 空気極材料の新規組成仮説

```
あなたは新物質探索型の仮説発見AIです。

## 分野
エネルギー材料（高温水蒸気電解・グリーン水素）

## 課題
SOEC は高効率なグリーン水素製造技術ですが、空気極の長期劣化（Sr 偏析、Cr 被毒、脱層）が商用化の障壁です。動作温度 600-700°C で 50,000 時間安定かつ高活性な新規空気極材料を仮説として提案してください。

## 分析手法
- **文献深層調査**（**ToolUniverse MCP** `openalex_literature_search` / `SemanticScholar_search_papers` / `ArXiv_search_papers`）
- **知識グラフ構築**（`text-mining-nlp` BioBERT NER + `network-visualization` Louvain）: Sr偏析の駆動力（弾性歪み、静電効果、化学ポテンシャル勾配）を因果エッジで表現
- **CCD 応答曲面**（`doe` CCD + `process-optimization` ML-RSM）: A サイト（La/Pr/Nd/Ba）× B サイト（Co/Fe/Mn/Ni）を因子とした CCD（25 条件）+ 2 次回帰
- **ベイズ最適化**（`bayesian-statistics` PyMC + `adaptive-experiments`）: RSM 有望領域内での逐次探索
- **因果推論**（`causal-ml` DoWhy）: Sr 偏析の因果グラフ（DAG）を構築し、バックドア基準で交絡因子を制御
- **不確実性定量化**（`uncertainty-quantification`）: ASR 予測値の信頼区間
- **特徴量重要度**（`feature-importance` Permutation + SHAP）: ASR に対する A/B サイト元素の寄与を定量化

## 調査指示
1. **ToolUniverse** の `openalex_literature_search`・`SemanticScholar_search_papers`・`ArXiv_search_papers` で SOEC 空気極の文献を横断検索し、`text-mining-nlp` で Sr 偏析因果構造の知識グラフを構築。`causal-ml` DoWhy で DAG ベースの因果分析を実施
2. 知識グラフのギャップ分析: Sr フリーで中温高活性を実現する未探索パスを特定（エクスソリューション法、プロトン伝導体に注目）
3. `doe` CCD 設計 25 条件を出力。`process-optimization` ML-RSM で 2 次モデル構築 + `uncertainty-quantification` で予測区間付与
4. `feature-importance` SHAP + Permutation で ASR 支配因子を特定。`hypothesis-pipeline` PICO で仮説 3 件以上を定式化
5. `bayesian-statistics` PyMC + `adaptive-experiments` Thompson Sampling で 50,000h 相当加速試験を含む BO 逐次探索計画を策定

## 出力
- `results/knowledge_graph.json` — Sr 偏析因果構造知識グラフ
- `results/causal_dag.json` — DoWhy 因果 DAG
- `results/doe_ccd_design.csv` — CCD 25 条件マトリックス
- `results/rsm_model.json` — RSM 回帰モデル（ASR 予測 ± UQ）
- `figures/shap_summary.png` — SHAP 特徴量寄与
- `docs/hypothesis.json` — PICO 仮説リスト
- `protocols/bo_accelerated_test.py` — BO 逐次探索 + 加速試験プロトコル
- **`report.md`** — 全分析プロセスと結果を統合した総合レポート（文献調査結果、因果分析、CCD設計、RSMモデル、SHAP分析、仮説一覧、BO探索計画を含む Markdown 形式）

**最重要**: `report.md`（総合レポート）を必ず最初に作成し、全分析結果を統合してください。その他の成果物もすべてファイルとして保存してください。
```

---

## SATORI スキル活用マトリックス

| # | プロンプト | deep-research | text-mining-nlp | hypothesis-pipeline | doe | computational-materials | graph-neural-networks | bayesian-statistics | uncertainty-quantification | explainable-ai | active-learning | その他 |
|---|-----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| 1 | 固体電解質 | ✓ | ✓ KG | ✓ PICO | ✓ LHS | ✓ 相図 | | ✓ BO | | | | network-viz |
| 2 | Co フリー正極 | ✓ | ✓ KG | ✓ PICO | ✓ LHS | | ✓ GCN | | | ✓ SHAP | | process-opt |
| 3 | ペロブスカイト | ✓ | ✓ BERTopic | ✓ PICO | ✓ CCD | ✓ バンド | | | ✓ CP | | | process-opt RSM |
| 4 | OER 触媒 | ✓ | ✓ KG | ✓ PICO | ✓ LHS | | | | ✓ MC-DO | ✓ SHAP | ✓ AL | deep-chemistry |
| 5 | 水素貯蔵 | ✓ | ✓ KG | ✓ PICO | ✓ 田口 | | | ✓ BO | | | | symbolic-math, md-sim |
| 6 | 熱電変換 | ✓ | ✓ KG | ✓ PICO | ✓ LHS | ✓ バンド | | | | | ✓ batch-AL | systems-bio Sobol |
| 7 | 核融合壁 | ✓ | ✓ KG | ✓ PICO | ✓ LHS | ✓ 相図 | | | | | | systematic-review, md-sim |
| 8 | CO₂ 還元 | ✓ | ✓ KG | ✓ PICO | | | | | ✓ CP | ✓ SHAP | | deep-chem, adaptive-exp |
| 9 | 超伝導 | ✓ | ✓ BERTopic | ✓ PICO | ✓ | ✓ バンド+相図 | ✓ GIN | | | | | semantic-scholar |
| 10 | SOEC 空気極 | ✓ | ✓ KG | ✓ PICO | ✓ CCD | | | ✓ BO | ✓ | ✓ SHAP | | causal-ml DAG |

**活用スキル合計**: 190 スキル中 **23 スキル** をプロンプト群で直接活用

## 注意事項

- 全プロンプトが **Scientist スキル** + **SATORI サブスキル群** + **ToolUniverse MCP** を併用
- **論文検索**は ToolUniverse MCP 経由: `openalex_literature_search` / `SemanticScholar_search_papers` / `ArXiv_search_papers` をプライマリツールとして使用
- **SATORI 出力ファイル規約**（`results/`, `figures/`, `docs/`, `protocols/`）に準拠
- 各プロンプトの所要時間は **10-20 分** 程度を想定（高度分析により増加）
- 3 つに絞る場合: **#1, #4, #7**（LHS+BO, DeepChem+AL, PRISMA+CALPHAD の多様性）
- 5 つに絞る場合: **#1, #4, #5, #7, #10**（LHS, 能動学習, 田口, PRISMA, CCD/因果推論）
