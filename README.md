# Agent Office

AIエージェントを、実際のオフィスで働いている社員のように可視化・操作するための個人開発プロジェクト。

## 1. コンセプト

### 一言でいうと

> **「自分のAI Agentチームが働いている様子を、仮想オフィスとして眺め、そこから直接指示できるUI」**

UIの見た目は、カイロソフトの「ゲーム発展国」のような**2Dドット絵の会社経営シミュレーションゲーム**を参考にする。

ただし、このプロダクト自体をゲーム化するわけではない。

### 重要な方針

**ゲーム発展国っぽくするのはUI/ビジュアルだけ。**

Agentに以下のようなゲーム要素は持たせない。

* レベル
* 経験値
* HP
* ステータス値
* スキルポイント
* 成長要素
* お金
* ゲーム内通貨
* ガチャ
* その他ゲーム的なパラメータ

Agentはあくまで**実際に仕事をするAIエージェント**として扱う。

---

# 2. UIコンセプト

## 基本イメージ

画面には複数の「部屋」が存在する。

**1つの部屋 = 1つのプロジェクト**

例えば、

```text
┌─────────────────────────────────────────────┐
│                AGENT OFFICE                 │
│                                             │
│  ┌──────────── Project A ────────────┐     │
│  │                                    │     │
│  │   Developer              Researcher│     │
│  │      🧑‍💻                    🧑‍💻     │     │
│  │      💻                     ☕      │     │
│  │    Working                  Idle    │     │
│  │                                    │     │
│  │             Reviewer               │     │
│  │                🧑‍💻                 │     │
│  │                💤                  │     │
│  └────────────────────────────────────┘     │
│                                             │
│  ┌──────────── Project B ────────────┐     │
│  │                                    │     │
│  │      Developer        Tester       │     │
│  │         🧑‍💻            🧑‍💻          │     │
│  │         💻             💻           │     │
│  └────────────────────────────────────┘     │
│                                             │
├─────────────────────────────────────────────┤
│ 💬 指示を入力...                     [送信] │
└─────────────────────────────────────────────┘
```

実際のキャラクターは絵文字ではなく、**2Dドット絵キャラクター**を使用する。

---

# 3. このUIで実現したい体験

最も重要なのは、

> **「AI Agentが本当にオフィスで働いているように見える」**

という体験。

例えばユーザーが、

> 「ログイン機能を実装して」

と指示する。

すると、

```text
ユーザー
  ↓
タスク生成
  ↓
対象Agent決定
  ↓
Agent実行
  ↓
UI上のAgentが仕事開始
```

となる。

UI上では、

```text
Before

Developer
  🧑‍💻
  ☕
  Idle


After

Developer
  🧑‍💻
  💻
  Working...

  「ログイン機能を実装中」
```

のように変化する。

Agentが仕事を終えると再びIdleになる。

---

# 4. Agentの状態

Agentには、最低限の状態を持たせる。

```typescript
type AgentStatus =
  | "idle"
  | "working"
  | "waiting"
  | "error";
```

### 状態とUI

| Status    | UI表現         |
| --------- | ------------ |
| `idle`    | 休憩、読書、コーヒーなど |
| `working` | PCで作業、タイピング  |
| `waiting` | PCの前で待機      |
| `error`   | 困っているような表現   |

将来的に必要になれば状態を増やす。

---

# 5. Agentモデル

Agentはゲームキャラクターではなく、実際のAgent Runtime上のAgentを表現する。

MVPでは以下程度でよい。

```typescript
type Agent = {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  currentTask?: string;
};
```

### 例

```json
{
  "id": "developer",
  "name": "Developer",
  "role": "Software Engineer",
  "status": "working",
  "currentTask": "ログイン機能を実装中"
}
```

---

# 6. Project

1つの部屋が1つのProjectに対応する。

```typescript
type Project = {
  id: string;
  name: string;
  agents: Agent[];
};
```

例：

```text
Project: Investment App

├── Researcher
├── Developer
└── Reviewer
```

Projectをクリックすると、そのProjectの詳細を表示できる。

---

# 7. 指示機能

画面から直接Agentに指示を出せるようにする。

画面下部などに常設する。

```text
┌────────────────────────────────────────────┐
│ 💬 指示を入力                              │
│                                            │
│ ログイン機能を実装して                      │
│                                      [送信] │
└────────────────────────────────────────────┘
```

ユーザーは基本的に自然言語で指示する。

例：

* 「ログイン機能を実装して」
* 「株価APIについて調査して」
* 「このバグを修正して」
* 「テストを追加して」

---

# 8. Agentへのタスク振り分け

ユーザーが必ずAgentを指定する必要はない。

例えば、

> 「株価APIについて調査して」

と入力した場合、Agent Runtime側で適切なAgentを判断する。

```text
User
 ↓
Task Manager
 ↓
適切なAgentを選択
 ↓
Researcher Agent
```

UIはRuntimeから結果を受け取り、該当AgentをWorking状態に変更する。

---

# 9. Agentのモーション

このプロジェクトでは、Agentの状態を**モーションで表現することが非常に重要**。

## Idle

何も仕事をしていないとき。

候補：

* PCから離れている
* コーヒーを飲む
* 本を読む
* 座って休む
* 周囲を見る
* 少し歩く

複数のIdleモーションをランダムに切り替えて、オフィスが静止画にならないようにする。

## Working

仕事中。

候補：

* デスクに座る
* PCを見る
* タイピングする
* モニターを見る
* 書類を見る

## Waiting

Agent間の処理待ちなど。

候補：

* PCの前で待つ
* 時計を見る
* 考える

## Error

Agentがエラーになった場合。

候補：

* 困る
* 頭を抱える
* PCを見る
* アラートを確認する

---

# 10. Activity表示

Agentが何をしているかを、ユーザーが理解できる程度に表示する。

ただし、LLMの内部思考・Chain of Thoughtそのものは表示しない。

表示例：

```text
🔍 Searching web...
📖 Reading files...
✏️ Editing api.ts
🧪 Running tests...
👀 Reviewing changes...
⏳ Waiting for Developer...
```

これはAgent RuntimeからUIへ送られるActivityイベントとして扱う。

例：

```json
{
  "project": "investment-app",
  "agent": "researcher",
  "status": "working",
  "activity": "Searching web..."
}
```

---

# 11. Agent Runtimeとの関係

UIとAgent実行部分は分離する。

```text
┌─────────────────────────────┐
│      Virtual Office UI      │
│                             │
│  Project A                  │
│   🧑‍💻 Working              │
│   🧑‍💻 Idle                 │
│                             │
└──────────────┬──────────────┘
               │
          WebSocket等
               │
┌──────────────▼──────────────┐
│       Agent Runtime         │
├─────────────────────────────┤
│ Task Manager                │
│ Agent Manager               │
│ Event Manager               │
└──────────────┬──────────────┘
               │
       ┌───────┼────────┐
       ↓       ↓        ↓
  Developer Researcher Reviewer
```

Virtual Office UIはAgentそのものを実行するのではなく、

> **Agent Runtimeから送られてくるイベントを可視化する**

という役割を持つ。

---

# 12. イベント設計

例えばAgentが仕事を開始した場合、

```json
{
  "type": "agent.status_changed",
  "projectId": "investment-app",
  "agentId": "developer",
  "status": "working",
  "activity": "Editing authentication API"
}
```

完了したら、

```json
{
  "type": "agent.status_changed",
  "projectId": "investment-app",
  "agentId": "developer",
  "status": "idle",
  "activity": null
}
```

UIはこのイベントを受けてキャラクターの状態・モーションを変更する。

---

# 13. UIの見た目

## 目指す方向

**カイロソフト系の2Dドット絵オフィスシミュレーション**

ただし、完全コピーではなく独自のビジュアルにする。

### 取り入れたい要素

* 2Dドット絵
* トップダウン〜斜め見下ろし視点
* 小さなキャラクター
* デスク
* PC
* 椅子
* 会議室
* 本棚
* 観葉植物
* オフィス家具
* キャラクターの歩行
* 作業モーション
* 休憩モーション
* 部屋を見渡せるレイアウト

### 取り入れない要素

* キャラクターのレベル
* ステータス育成
* 経験値
* 給料
* お金
* 採用ゲーム
* ゲーム内ランキング
* RPG的な成長要素

---

# 14. UIと機能の優先順位

## MVP

まずは以下だけ作る。

### ① オフィス画面

複数のProject Roomを表示。

```text
Project A
Project B
Project C
```

### ② Agent表示

各Project内にAgentを配置。

```text
Developer
Researcher
Reviewer
```

### ③ Idleモーション

仕事をしていないAgentが自然に動く。

### ④ 指示入力

画面からProjectに対して指示を出す。

### ⑤ Working状態

指示されたAgentがWorking状態になる。

### ⑥ Workingモーション

Working中はPC作業などのモーションに切り替える。

### ⑦ 完了

Task完了時にIdleへ戻す。

---

# 15. MVP後

MVPが完成したら以下を追加する。

### Project詳細

Projectをクリックするとズームイン。

```text
Project: Investment App

Developer     💻 Working
Researcher    ☕ Idle
Reviewer      💤 Idle
```

### Agent詳細

Agentをクリックすると、

```text
Developer

Role
Software Engineer

Status
Working

Current Task
ログイン機能を実装中

Activity
Editing auth/api.ts
```

を表示。

### Task履歴

Projectごとに過去のTaskを確認できる。

```text
Task History

✓ ログイン機能を実装
✓ APIテストを追加
✓ DBスキーマを変更
✗ 認証エラーを修正
```

### Agent間連携

Agent AがAgent Bに仕事を渡した場合、

```text
Developer
    ↓
Reviewer
```

のような視覚的な表現を検討する。

---

# 16. UX上の重要な考え方

このUIの目的は、Agentの内部処理をすべて表示することではない。

ユーザーが画面を見た瞬間に、

> **「誰が働いている？」**
>
> **「誰が待機している？」**
>
> **「どのプロジェクトが動いている？」**
>
> **「今何をしている？」**

が分かることを最優先する。

つまり、

**情報量を増やすのではなく、Agentの状態を視覚的に理解できるようにする。**

---

# 17. プロダクトの方向性

最終的には、

> **Slack + VS Code + 仮想オフィス**

のような体験を目指す。

ただし、中心となるのはチャットUIではない。

中心となるのは、

**「AI Agentが実際に仕事をしている世界を眺める」**

という体験。

```text
             ┌─────────────────┐
             │   Agent Office  │
             │                 │
             │ 🧑‍💻💻           │
             │ Developer       │
             │                 │
             │ 🧑‍💻☕           │
             │ Researcher      │
             │                 │
             │ 🧑‍💻💻           │
             │ Reviewer        │
             └────────┬────────┘
                      │
                 指示を入力
                      │
                      ↓
                 Agent Runtime
                      │
                      ↓
                 Agentが実行
                      │
                      ↓
              オフィス上で働く
```

---

# 18. 開発時の基本原則

1. **ゲームではなくAgent管理ツール**
2. **ゲームっぽさはビジュアルだけ**
3. **Agentに不要なゲームパラメータを持たせない**
4. **Agent RuntimeとUIを分離する**
5. **Agentの状態をイベントとしてUIに伝える**
6. **状態変化をキャラクターのモーションで表現する**
7. **ユーザーが一目で状況を理解できることを優先する**
8. **最初はシンプルな2Dオフィスから始める**
9. **MVPでは「指示 → Agentが働く → 完了 → Idle」を完成させる**
10. **内部思考ではなく、安全なActivity情報を表示する**

---

# 19. 最初に実装するもの

最初のゴールは以下。

```text
1. 2Dオフィス画面
        ↓
2. Project Roomを1つ表示
        ↓
3. Agentを3人配置
        ↓
4. Idleモーション
        ↓
5. 指示入力UI
        ↓
6. AgentをWorking状態に変更
        ↓
7. Workingモーション
        ↓
8. Task完了イベント
        ↓
9. Idleに戻る
```

これが完成すれば、**Agent Officeの基本コンセプトが成立する。**

その後、Projectを増やし、Agent Runtimeとのリアルタイム連携を実装していく。
