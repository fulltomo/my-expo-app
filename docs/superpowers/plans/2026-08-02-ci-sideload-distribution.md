# GitHub Actions + Sideloadly 配布パイプライン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GitHub Actions上でiOS向けの未署名IPAをビルドし、Sideloadlyでローカル実機にサイドロードできるようにする。あわせて現在ローカルのみのリポジトリをパブリックなGitHubリポジトリとして公開する。

**Architecture:** `macos-14` runner上で`expo prebuild --platform ios`によりネイティブプロジェクトを生成し、コード署名を無効化した`xcodebuild build`で`.app`を生成、それを`Payload/`にまとめてzip化し`.ipa`として`actions/upload-artifact`で公開する。GitHub Actionsのシークレットは一切使用せず、Apple IDによる署名はユーザーがローカルのSideloadlyで行う。

**Tech Stack:** GitHub Actions（`macos-14`）、Xcode CLI（`xcodebuild`）、`gh` CLI（リポジトリ作成）

参照設計書: `docs/superpowers/specs/2026-08-02-gyro-maze-game-design.md`

## 前提

**このプランを実行する前に、`docs/superpowers/plans/2026-08-02-gyro-maze-game.md`のTask 1（`app.json`への`ios.bundleIdentifier`追加）が完了している必要がある。** `expo prebuild --platform ios`は`bundleIdentifier`が設定されていないと失敗する。

## Global Constraints

- ビルド対象はiOSのみ（Androidのサイドロード配布は対象外）。
- CIは**未署名**の`.ipa`を生成する。GitHub Actionsのシークレット（Apple ID、パスワード、証明書等）は一切使用しない。
- ワークフローのトリガーは`push`（`main`ブランチ）と`workflow_dispatch`（手動実行）。
- 実行環境は`macos-14`。
- リポジトリは`gh repo create my-expo-app --public`でパブリックとして作成する。

---

## Task 1: iOS未署名ビルド用GitHub Actionsワークフローの作成

**Files:**
- Create: `.github/workflows/ios-build.yml`

**Interfaces:**
- Consumes: `app.json`の`ios.bundleIdentifier`（前提タスクで設定済み）
- Produces: `push`/`workflow_dispatch`で起動し、`MyExpoApp-unsigned-ipa`という名前のArtifactとして`.ipa`を出力するワークフロー

- [ ] **Step 1: ワークフローディレクトリを作成**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: ワークフローファイルを作成**

`.github/workflows/ios-build.yml`:

```yaml
name: iOS Unsigned Build (Sideloadly)

on:
  push:
    branches: [main]
  workflow_dispatch: {}

jobs:
  build-ipa:
    runs-on: macos-14
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Prebuild iOS native project
        run: npx expo prebuild --platform ios

      - name: Build unsigned .app
        run: |
          set -euo pipefail
          WORKSPACE=$(ls ios/*.xcworkspace)
          SCHEME=$(basename "$WORKSPACE" .xcworkspace)
          xcodebuild build \
            -workspace "$WORKSPACE" \
            -scheme "$SCHEME" \
            -configuration Release \
            -sdk iphoneos \
            -derivedDataPath build \
            CODE_SIGNING_ALLOWED=NO \
            CODE_SIGNING_REQUIRED=NO \
            CODE_SIGNING_IDENTITY="" \
            EXPANDED_CODE_SIGN_IDENTITY="" \
            EXPANDED_CODE_SIGN_IDENTITY_NAME="" \
            EXPANDED_PROVISIONING_PROFILE=""

      - name: Package unsigned .ipa
        run: |
          set -euo pipefail
          APP_PATH=$(find build/Build/Products/Release-iphoneos -maxdepth 1 -name "*.app")
          mkdir -p Payload
          cp -r "$APP_PATH" Payload/
          zip -r MyExpoApp.ipa Payload

      - name: Upload .ipa artifact
        uses: actions/upload-artifact@v4
        with:
          name: MyExpoApp-unsigned-ipa
          path: MyExpoApp.ipa
```

- [ ] **Step 3: YAML構文が正しいことをローカルで確認**

Run: `node -e "require('js-yaml') ? '' : ''" 2>/dev/null; python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ios-build.yml')); print('OK')"`

Expected: `OK`が出力される（`python3`の`yaml`モジュールが無い場合は`pip install pyyaml`後に再実行、もしくは`gh workflow view`が使えるようになるTask 2のPushまで待って確認してもよい）。

- [ ] **Step 4: コミット**

```bash
git add .github/workflows/ios-build.yml
git commit -m "Add unsigned iOS IPA build workflow for Sideloadly distribution"
```

---

## Task 2: パブリックリポジトリの作成・push・ワークフロー実行確認

**このタスクは実際にGitHub上にパブリックリポジトリを作成し、コードをpushする。実行前にユーザーの最終確認を得ること。**

**Files:** なし（GitHub操作のみ）

**Interfaces:**
- Consumes: `.github/workflows/ios-build.yml`（Task 1で作成済み）
- Produces: `https://github.com/<owner>/my-expo-app`のパブリックリポジトリと、少なくとも1回成功したワークフロー実行

- [ ] **Step 1: 現在のリポジトリ状態を確認**

Run: `git status && git remote -v`
Expected: リモート未設定であることを確認（既に設定されている場合は上書きしないよう、ユーザーに確認する）。

- [ ] **Step 2: パブリックリポジトリを作成してpush**

```bash
gh repo create my-expo-app --public --source=. --remote=origin --push
```

Expected: `gh repo view`でリポジトリのURLが確認できる。

- [ ] **Step 3: ワークフローを手動起動して結果を確認**

```bash
gh workflow run ios-build.yml
gh run watch
```

Expected: ジョブが`success`で完了する。失敗した場合はログ（`gh run view --log-failed`）を確認し、`xcodebuild`のエラー内容に応じて`.github/workflows/ios-build.yml`を修正して再実行する（例: スキーム名の解決失敗、Podのバージョン不整合など）。

- [ ] **Step 4: Artifactがダウンロード可能なことを確認**

```bash
gh run download --name MyExpoApp-unsigned-ipa --dir /tmp/maze-ipa-check
ls -la /tmp/maze-ipa-check
```

Expected: `MyExpoApp.ipa`が存在する。

---

## 配布手順（このタスク完了後、ユーザーがローカルで行う作業）

1. GitHub Actionsの該当実行のArtifactsから`MyExpoApp-unsigned-ipa`をダウンロードする。
2. [Sideloadly](https://sideloadly.io/)を起動し、`.ipa`をドラッグ＆ドロップする。
3. 自分のApple IDでサインインし（GitHub Actionsには一切送信されない）、実機をUSB接続してインストールする。
4. 無料のApple IDの場合、署名の有効期限は7日間のため、期限が切れたら同じ手順で再インストールする。

## Self-Review メモ

- **仕様カバレッジ**: macOS runnerでの未署名ビルド／シークレット不使用／`push`+`workflow_dispatch`トリガー／`.ipa`のArtifact公開／パブリックリポジトリ作成 — Task 1〜2でカバー済み。
- **プレースホルダー確認**: 「TBD」等の記述なし。ワークフローYAMLは実際に動作する完全な内容を記載。
- **既知のリスク**: `expo prebuild`が生成するXcodeプロジェクト名・スキーム名は実行するまで確定しないため、Task 1のワークフローでは`ios/*.xcworkspace`をglobで解決する方式にして名前のハードコードを避けている。それでもビルドが初回で失敗する可能性はあり、その場合はTask 2 Step 3のログ確認→修正→再実行のループで対応する。
