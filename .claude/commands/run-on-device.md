---
description: 実機(Expo Go)で動作確認するための準備をする
---

このプロジェクトで実機確認を行うための準備をする。

## 前提

- このプロジェクトの実機確認は一般的にExpo Go経由で行う
- QRコードによる接続か、手動URL入力のいずれかを使う
- 実機での最終確認はユーザー自身が行い、開発者が代行できるのは接続用の準備までに留める

## 手順

1. デフォルトポートが他プロジェクトと衝突していないか確認する。
2. LAN IPを取得する。
3. 実際の接続はユーザーが行う。以下の手順を案内する。

```bash
cd /Users/taiga/Projects/agent-office
npm start
```

- スマホとMacが同じWi-Fiに接続されていることを確認する
- QRコードをExpo Goで読み取るか、`exp://<LAN_IP>:8081` を直接入力する
- 実機確認前に、開発サーバーが正常に起動しているかを確認する

4. バンドル確認が必要な場合は、次のようにヘッドレスな確認を行う。

```bash
npx expo export --platform ios --output-dir /tmp/agent-office-export
```

- `iOS Bundled ... (N modules)` が出て正常終了すればOK
- 確認後は `rm -rf /tmp/agent-office-export` で削除する

## 既知の落とし穴

- Expo Goの署名やSDKの互換性が問題になる場合があるため、プロジェクトのExpo SDKとの整合性を事前に確認する
- devサーバーをバックグラウンドで起動したまま放置すると、次回の起動時にポート競合が起きるので、作業終わりには停止する
