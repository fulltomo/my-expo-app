# ジャイロ（傾き）操作の迷路ゲーム 設計書

- 日付: 2026-08-02
- ステータス: 承認済み（ユーザー承認済み、実装計画フェーズへ）

## 概要

既存のExpo Routerアプリ（タブ構成）の「Explore」タブを、端末を傾けてボールを転がす迷路ゲームに置き換える。壁に当たるとハプティクスが発生し、ゴールに到達すると成功演出とリセット導線を表示する。あわせて、GitHub ActionsでiOS用の未署名IPAをビルドし、Sideloadlyでローカル実機にサイドロードできるようにする。

## 前提・確認済み事項

- ユーザーは「ジャイロセンサー」と表現したが、実際に使うのは傾き（重力方向）を検知する **Accelerometer**（`expo-sensors`）。`Gyroscope`（角速度センサー）は時間経過でドリフトし、ボールが勝手に動き続ける問題があるため不採用。
- 描画は `@shopify/react-native-skia` を使用。Expo Go には同梱されていないため、**開発用クライアントの再ビルドが必須**（後述のCIでのビルドに繋がる）。
- 迷路は固定の1面・シンプルな壁配置（動的生成なし）。
- 壁衝突時はボールが壁に沿って滑る（ブロック＋スライド）。跳ね返りはしない。
- ハプティクスは壁との新規接触時に発火し、150msのクールダウンを設ける（滑走中の連続振動を防止）。
- ゴール到達時は成功ハプティクス＋メッセージを表示し、「もう一度」ボタンでリセット。

## アーキテクチャ

### 新規依存パッケージ

- `@shopify/react-native-skia` — 迷路・ボール・ゴールの描画
- `expo-sensors` — Accelerometerによる傾き取得
- （既存）`expo-haptics`、`react-native-reanimated` はそのまま利用

### ファイル構成

- `app/(tabs)/explore.tsx` — 既存の内容を破棄し `<MazeGame />` を描画するだけの薄いラッパーに置き換え。タブタイトルを「Maze」に変更し、アイコンも迷路らしいものに変更する。
- `components/maze/maze-data.ts` — 迷路の静的データ定義
  - ロジック座標系（例: 320×520）での壁の矩形リスト（外周＋内部壁、10〜12本程度）
  - スタート位置、ゴール矩形、ボール半径
- `components/maze/maze-game.tsx` — ゲーム画面本体
  - Skiaの`<Canvas>`セットアップ
  - Accelerometer購読
  - Reanimatedの`useFrameCallback`による物理演算ループ
  - 衝突解決・ハプティクス発火・勝利判定
  - 勝利時オーバーレイ（メッセージ＋「もう一度」ボタン）
- `components/maze/collision.ts` — 円と矩形の衝突判定・押し出し解決ロジック（純粋関数として切り出し、ユニットテスト対象にする）

### 物理・入力

- Accelerometerは`setUpdateInterval`で約60Hzに設定。JSスレッドのリスナーからReanimatedの共有値（tiltX, tiltY）へ書き込む。
- `useFrameCallback`（UIスレッド）が毎フレーム以下を実行:
  1. `velocity += tilt * sensitivity * dt` 後、摩擦減衰を適用し、最大速度でクランプ
  2. 仮の新しい位置 = `position + velocity * dt`
  3. 各壁矩形との円対矩形の衝突判定。重なりがあれば、貫通量が小さい軸方向に押し出し、その軸の速度成分を0にする（スライド挙動）
  4. ゴール矩形との衝突判定 → `won`共有値をセット
- Skiaの`Circle`/`Rect`はReanimatedの共有値をprops（`cx`, `cy`など）として直接受け取れるため、UIスレッド内で完結して再描画される（JSブリッジを跨がない標準的なSkia+Reanimatedのゲームパターン）。

### ハプティクス

- 「壁に接触中かどうか」と「直近のハプティクス発火時刻」を共有値で管理。
- 新規接触が始まったフレームで、前回発火から150ms以上経過していれば`runOnJS`でJSスレッドに移り`Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`を発火。
- ゴール到達時は一度だけ`Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`を発火。

### 勝利状態

- ゴール到達で状態を`'won'`にし、物理ループを停止。オーバーレイ（「ゴール！🎉」＋「もう一度」ボタン）を表示。
- 「もう一度」タップでボール位置・速度をスタート地点にリセットし、状態を`'playing'`に戻す。

### app.json への変更

- `ios.bundleIdentifier`: `com.fulltomo.myexpoapp`（仮。後で変更可能）。CIでは`expo prebuild --platform ios`のみを行うため、`android.package`の追加は今回不要（スコープ外）。
- `ios.infoPlist.NSMotionUsageDescription`: Accelerometer利用の説明文を追加

## ビルド・配布（GitHub Actions + Sideloadly）

### リポジトリ

- `gh repo create my-expo-app --public` で現在のローカルリポジトリをパブリックリポジトリとして新規作成し、現状のコードをpushする。
- 目的: GitHub Actionsの macOS runner をパブリックリポジトリの無料無制限枠で使うため。

### ワークフロー（`.github/workflows/ios-build.yml`）

- トリガー: `push`（mainブランチ）、`workflow_dispatch`（手動実行）
- 実行環境: `macos-14`
- ステップ:
  1. チェックアウト、Node.jsセットアップ、`npm ci`
  2. `npx expo prebuild --platform ios`（Skiaはネイティブコードを含むため必須）
  3. `xcodebuild build`（`CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO` で署名なしビルド）
  4. ビルド済み`.app`を`Payload/`配下に配置し、zip化して`.ipa`にリネーム（Sideloadly/AltStore方式の未署名IPA作成手順）
  5. `actions/upload-artifact`で`.ipa`を成果物として公開
- **GitHub Actionsのシークレットは使用しない**。Apple IDによる署名はSideloadly側でユーザーがローカルで行う（AltStoreと同様の無料サイドロード方式）。

### 配布フロー（ユーザー側の手動作業）

1. GitHub ActionsのArtifactsから`.ipa`をダウンロード
2. Sideloadlyを起動し、`.ipa`をドラッグ＆ドロップ
3. 自分のApple IDでサインインし、実機にUSB接続してインストール
4. 無料Apple IDの場合、証明書の有効期限は7日間（再インストールが定期的に必要）

## テスト方針

- 衝突判定・押し出し解決ロジック（`collision.ts`）は純粋関数として切り出し、ユニットテストを書く（矩形の各辺からの衝突、コーナーケースなど）。
- クールダウンによるハプティクス発火制御も、時刻を引数化してユニットテスト可能にする。
- センサー入力を伴う実際の操作感（傾けてボールが動くか等）は、シミュレーターでは実機のAccelerometerを再現できないため、**物理デバイスでの手動確認が必要**。自動テストではカバーできない旨を明記し、実装完了時に「シミュレーターでは未検証」であることを明示する。

## スコープ外（今回やらないこと）

- 複数ステージ・迷路の動的生成
- スコアやタイマー機能
- Android向けのサイドロード配布フロー（GitHub ActionsでのAPKビルドは対象外。iOS + Sideloadlyのみ）
- CIでの署名済みビルド（Apple Developer Program証明書の利用）
