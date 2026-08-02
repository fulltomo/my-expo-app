# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

「Explore」タブは、端末の傾き（Accelerometer）でボールを転がす迷路ゲームに置き換えられています。壁に当たるとハプティクスが発火し、ゴールに到達すると成功演出とリセット導線が表示されます。実装は `components/maze/` 以下（`collision.ts` / `haptics-gate.ts` は純粋関数でJestテスト済み、`maze-game.tsx` がSkia + Reanimatedでのゲーム画面）。

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## iOS向けビルド配布（GitHub Actions + Sideloadly）

このリポジトリはパブリックリポジトリで、`.github/workflows/ios-build.yml` が `master` へのpush（および手動実行）のたびに未署名の `.ipa` をビルドし、Artifactとして公開します。GitHub Actionsのシークレットは一切使用せず、Apple IDによる署名は各自が[Sideloadly](https://sideloadly.io/)でローカルに行う想定です（AltStoreと同様の無料サイドロード方式）。

1. GitHub Actionsの該当実行のArtifactsから `.ipa` をダウンロード
2. Sideloadlyに `.ipa` をドラッグ＆ドロップし、自分のApple IDでサインイン
3. 実機をUSB接続してインストール（無料Apple IDの場合、署名は7日で失効するため再インストールが必要）

### GitHub Actionsでの学び（他のモバイルアプリでも起きうる問題）

このワークフローを実際に動かすまでに3回失敗しており、原因はどれも「ローカルでは気づけず、実際にCIを回して初めて分かる」類のものでした。同じ構成（Expo / React Native + `macos-*` runner + `xcodebuild`）で新しいアプリを作る際は、最初から次の点を踏まえておくと同じ失敗を避けられます。

- **`macos-14` の既定Xcodeは古いことがある。** GitHub Actionsの `macos-14` runnerが標準で選択するXcodeは 15.4 だったが、React Native 0.81 は Xcode 16.1 以上を要求しており、`pod install` の時点で `Invalid Podfile: Please upgrade XCode` として失敗した。`runs-on: macos-15` に変更し、さらに [`maxim-lobanov/setup-xcode@v1`](https://github.com/maxim-lobanov/setup-xcode)（`xcode-version: latest-stable`）でXcodeを明示的に選択することで解決した。runnerイメージの既定Xcodeはいつ変わってもおかしくないため、**バージョン要求があるライブラリを使うなら最初からXcodeを明示選択しておく**のが安全。
- **ワークフローのトリガーブランチ名は、リポジトリの実際のデフォルトブランチと必ず一致させる。** テンプレート的に `branches: [main]` としていたが、このリポジトリのデフォルトブランチは `master` だったため、pushしてもワークフローが一切発火しなかった。`git branch --show-current` や `gh repo view` で実際のブランチ名を確認してから書くこと。
- **`.xcworkspace` はディレクトリ（バンドル）なので、`ls` はその中身を展開してしまう。** `WORKSPACE=$(ls ios/*.xcworkspace)` と書くと、ディレクトリの中の `contents.xcworkspacedata` 等のファイル名を拾ってしまい、`xcodebuild` に渡すパスが壊れる。`ls -d ios/*.xcworkspace` のように `-d` を付けて、ディレクトリ自身のパスを取得する必要がある。同様の罠は `.xcodeproj` や `.app` など、他の“ディレクトリ拡張子”を扱うシェルスクリプトでも起こりうる。
- **未署名IPAは `CODE_SIGNING_ALLOWED=NO` 等のxcodebuildフラグ＋`Payload/`にzipするだけで作れる。** Apple Developer証明書やApple IDをGitHub Actionsのシークレットとして登録しなくても、CIでは「署名しないビルド」まで作り、実際の署名はローカルのSideloadly（またはAltStore）にApple IDで行わせる、という役割分担が成立する。個人開発でCIに機密情報を置きたくない場合に有効なパターン。
- **ワークフローはローカルのYAML構文チェックだけでは不十分。** `python3 -c "import yaml; yaml.safe_load(...)"` で構文エラーは検出できるが、上記のような実行時エラー（Xcodeバージョン、シェルの`ls`展開）はローカルでは再現できず、実際にpush/`workflow_dispatch`で走らせて初めて発覚した。CIワークフローを新規に書いたら、「1回で成功する」ことを期待せず、失敗ログを見て直す前提で余裕を持っておくとよい。

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
