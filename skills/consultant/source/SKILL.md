---
name: consultant-assistant
description: |
  AI consultant skill for deep research and consulting analysis.
  Based on the SHIKIGAMI methodology, featuring 4-phase workflow:
  Purpose Discovery, Deep Research, Framework Analysis, and Report Writing.
  Provides 53 consulting frameworks across 14 categories with MECE validation,
  pyramid structuring, and hypothesis-driven analysis.
---

# Consultant Assistant

深層リサーチ＆コンサルティング分析のためのAIアシスタントスキルパッケージです。

## ワークフロー

4つのフェーズで構成されるコンサルティングワークフローを提供します。

```
Phase 1: Purpose Discovery（目的探索）
    ↓ 5 Whys / JTBD で「真の目的」を発見
Phase 2: Deep Research（深層リサーチ）
    ↓ Think→Action→Report サイクルで情報収集
Phase 3: Framework Analysis（フレームワーク分析）
    ↓ 53フレームワークで構造化分析
Phase 4: Report Writing（レポート生成）
    ↓ ピラミッド原則に基づくレポート作成
```

## プロンプト一覧

| プロンプト | フェーズ | 説明 |
|-----------|---------|------|
| **purpose-discovery** | Phase 1 | 対話的目的探索を開始 |
| **deep-research** | Phase 2 | 反復的深層リサーチを実行 |
| **framework-analysis** | Phase 3 | フレームワーク分析を実行 |
| **report-writing** | Phase 4 | レポートを生成 |
| **full-research** | 全フェーズ | 統合リサーチを実行 |

## スキル一覧

| スキル | 説明 |
|--------|------|
| **orchestrator** | リクエスト分類とフェーズルーティング |
| **framework-library** | 53フレームワーク定義と選択支援 |

## 使い方

ユーザーのリクエストに応じて、orchestrator が適切なフェーズを自動選択します。

### 例

- 「競合分析をしたい」→ purpose-discovery → 真の目的を探索
- 「AI市場について調べて」→ full-research → 統合リサーチ
- 「収集した情報をSWOT分析して」→ framework-analysis
- 「調査結果をレポートにまとめて」→ report-writing
- 「新規事業の提案書を作って」→ full-research（全フェーズ）

## フレームワーク（53定義）

| カテゴリ | 件数 | 代表例 |
|---------|------|--------|
| 戦略分析 | 10 | SWOT, 3C, PEST, 5Forces, BCG, VRIO |
| 問題解決 | 7 | MECE, ロジックツリー, イシューツリー, 5 Whys, フィッシュボーン |
| 思考整理 | 3 | ピラミッド構造, So What/Why So, PREP |
| 意思決定 | 4 | 意思決定マトリクス, プロコン, リスクマトリクス, コストベネフィット |
| マーケティング | 7 | 4P, 4C, STP, カスタマージャーニー, ペルソナ, AIDMA/AISAS |
| イノベーション | 7 | BMC, リーンキャンバス, TAM/SAM/SOM, デザイン思考, SCAMPER |
| プロセス改善 | 3 | PDCA, OODA, ECRS |
| 組織分析 | 2 | 7S, RACI |
| 顧客分析 | 2 | RFM, NPS |
| 汎用ツール | 5 | 5W1H, SMART, OKR, KPT, JTBD |
| 財務分析 | 3 | デュポン, CVP, DCF |

## 品質ゲート

各フェーズ間に品質ゲートを設けて、分析品質を担保します。

## MCP連携

`deep-research` MCP サーバーが Settings > MCP Servers で有効な場合、Phase 2（Deep Research）で
構造化リサーチフレームワーク（課題精緻化→サブ質問分解→Web検索→ソース評価→レポート生成）を
活用してください。MCP が利用できない場合は従来の Think→Action→Report ワークフローを使用します。

| ゲート | 条件 | ユーザー承認 |
|--------|------|-------------|
| 1→2 | 真の目的が定義済、リサーチ計画作成済、最低3回の対話 | **必要** |
| 2→3 | 3件以上のソース、信頼度60%以上 | 不要 |
| 3→4 | 1件以上のフレームワーク適用、数値検証済 | 不要 |
| 4→完了 | レポート存在、品質チェック通過、引用完備 | **必要** |

## 緊急度トリアージ

| レベル | キーワード | ワークフロー |
|--------|----------|-------------|
| 通常 | − | 全フェーズ実行 |
| 急ぎ | 急ぎ、今日中、明日まで | Phase 1→2簡略→3→4簡略 |
| 緊急 | 今すぐ、至急、概要のみ | Phase 1→2概要→4サマリー |
