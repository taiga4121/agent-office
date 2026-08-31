# CLAUDE.md

このファイルは、このリポジトリで作業するClaude Codeへのガイダンスです。

## プロジェクト概要

Agent Office: AIエージェントを、オフィスの中で働く社員として可視化し、指示・監視・調整できる個人開発プロジェクト。

目的は、複数のAgentを「部屋」や「プロジェクト」ごとに配置し、ユーザーが視覚的にその状態を把握できるUIを作ることです。

UIの要件:
- 1つの部屋 = 1つのプロジェクト
- 各部屋の中に、Developer / Researcher / Reviewer / Tester などのエージェントを配置する
- Agentは仕事中か休憩中か待機中かエラー状態かを視覚的に示す
- 直接指示の入力欄から、Agentにタスクを依頼できる
- その指示が実際のAgent runtimeやバックエンド連携の入口になる設計を想定する

## 開発方針

1. UIはゲームのようなオフィス制御画面を目指すが、ゲーム要素そのものは入れない
2. Agentは「実際に作業するAIエージェント」として扱う
3. ローカルUIの完成後に、バックエンドやワークフローを段階的に追加する
4. 変更が増えるたびに、テスト・検証・PRの手順を守る

## Gitワークフロー

トランクベース開発：`main`ブランチへの直接コミットは避ける。

1. `main`を最新化
2. `feature/*`の短命ブランチを作成
3. 実装
4. `lint` / `typecheck` / `test` をローカルで通す
5. `unit-test-writer`と`unit-test-runner`でテストを確認する
6. `git commit`する
7. PR作成前に `integration-test-writer` / `integration-test-runner` と `e2e-spec-writer` を進める
8. `gh pr create`する
9. マージ後にfeatureブランチを削除する

このリポジトリでは `.claude/settings.json` のフックにより、`git commit` と `gh pr create` の実行がローカルのマーカーファイルで機械的に制御される。

- `git commit`: `.claude/.unit-tests-verified` の有無で判定
- `gh pr create`: `.claude/.integration-tests-verified` と `.claude/.e2e-spec-verified` の両方で判定

## アーキテクチャ

初期の設計意図:

- `src/types/` に Agent / Project / AgentStatus の型定義を置く
- `src/state/` または `src/store/` でUI状態とAgent状態を管理する
- `src/components/` に各部屋・エージェントカード・入力欄を配置する
- `src/features/` にビジネスロジックを分離する
- `src/components/` の操作と状態連携に対して結合テストを追加する

実装の進め方としては、まずオフィス全体の見た目と状態遷移を固めてから、外部Agent runtimeやバックエンド連携を追加する。

## ルール

- 「AIをゲームキャラとして見せる」ことと「ゲーム的なステータス値を持たせる」ことは分ける
- 実際のAgent RuntimeやAPIとの接続を前提に設計する
- 変更が増えたら必ずテストを追加し、PR前に一連の検証を実施する
