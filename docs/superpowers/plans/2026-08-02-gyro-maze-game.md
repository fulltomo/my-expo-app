# ジャイロ（傾き）操作の迷路ゲーム Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存の「Explore」タブを、端末の傾きでボールを転がす固定1面の迷路ゲームに置き換える。壁衝突時にハプティクスを発火し、ゴール到達で成功演出とリセット導線を出す。

**Architecture:** `@shopify/react-native-skia`でCanvas描画、`react-native-reanimated`の`useFrameCallback`でUIスレッド上で毎フレーム物理演算（傾き→速度→衝突解決）を行い、Skiaコンポーネントに共有値を直接バインドしてJSブリッジを介さず描画する。衝突判定・押し出しロジックとハプティクスのクールダウン判定は純粋関数として切り出し、Jestでユニットテストする。

**Tech Stack:** Expo SDK 54 / Expo Router / TypeScript strict / `@shopify/react-native-skia` / `expo-sensors`(Accelerometer) / `expo-haptics` / `react-native-reanimated`(`useFrameCallback`, `useSharedValue`, `runOnJS`) / Jest + ts-jest（純粋関数のみ）

参照設計書: `docs/superpowers/specs/2026-08-02-gyro-maze-game-design.md`

## Global Constraints

- センサーは`expo-sensors`の**Accelerometer**を使用する（`Gyroscope`は使わない。角速度センサーはドリフトするため）。
- 描画は`@shopify/react-native-skia`を使用する。
- 迷路は固定1面・静的データ（動的生成なし）。
- 壁衝突はブロック＋スライド（壁に沿って滑る）。跳ね返りはしない。
- ハプティクスは壁への**新規接触時のみ**、かつ前回発火から**150ms以上**経過している場合にのみ発火する。
- ゴール到達時は成功ハプティクスを発火し、「もう一度」ボタンでリセットできるオーバーレイを表示する。
- `ios.bundleIdentifier`は`com.fulltomo.myexpoapp`とする。
- 衝突判定・押し出しロジックとハプティクスのクールダウン判定は、ネイティブモジュールに依存しない純粋関数として実装し、ユニットテスト可能にする。
- センサー入力を伴う実際の操作感は自動テストでは検証できない。物理デバイスでの手動確認が必須であり、シミュレーターでは未検証である旨を最終確認時に明記する。

---

## Task 1: 依存パッケージ追加とapp.json設定

**Files:**
- Modify: `package.json`（`@shopify/react-native-skia`, `expo-sensors`を追加）
- Modify: `app.json`（`ios.bundleIdentifier`, `ios.infoPlist.NSMotionUsageDescription`を追加）

**Interfaces:**
- Consumes: なし
- Produces: `@shopify/react-native-skia`と`expo-sensors`が`node_modules`にインストール済みであること。以降のタスクはこれらのパッケージをimportできる前提で進める。

- [ ] **Step 1: 依存パッケージをインストール**

```bash
npx expo install @shopify/react-native-skia expo-sensors
```

- [ ] **Step 2: `app.json`にiOSのbundleIdentifierとモーション権限の説明文を追加**

`app.json`の`"expo"."ios"`セクションを以下のように変更する（既存の`"supportsTablet": true`はそのまま残す）:

```json
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.fulltomo.myexpoapp",
      "infoPlist": {
        "NSMotionUsageDescription": "迷路ゲームでボールを操作するために端末の傾きを使用します"
      }
    },
```

- [ ] **Step 3: 設定が正しく反映されているか確認**

Run: `npx expo config --json | node -e "const c=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(c.ios.bundleIdentifier, c.ios.infoPlist.NSMotionUsageDescription)"`

Expected: `com.fulltomo.myexpoapp 迷路ゲームでボールを操作するために端末の傾きを使用します` が出力される。

- [ ] **Step 4: 型チェックが通ることを確認**

Run: `npx tsc --noEmit`
Expected: エラーなしで終了する（この時点ではまだ新パッケージを使うコードがないため、既存コードのみのチェックになる）。

- [ ] **Step 5: コミット**

```bash
git add package.json package-lock.json app.json
git commit -m "Add skia/sensors deps and configure iOS bundle id + motion usage description"
```

---

## Task 2: 衝突判定・ハプティクス制御ロジック（純粋関数・TDD）

**Files:**
- Create: `components/maze/collision.ts`
- Create: `components/maze/collision.test.ts`
- Create: `components/maze/haptics-gate.ts`
- Create: `components/maze/haptics-gate.test.ts`
- Create: `jest.config.js`
- Modify: `package.json`（`test`スクリプト、`jest`/`ts-jest`/`@types/jest`をdevDependenciesに追加）

**Interfaces:**
- Consumes: なし（React Native / Expoのネイティブモジュールに依存しない純粋なTypeScript）
- Produces:
  - `type Circle = { x: number; y: number; radius: number }`
  - `type Rect = { x: number; y: number; width: number; height: number }`
  - `type CircleRectCollision = { x: number; y: number; collidedX: boolean; collidedY: boolean }`
  - `resolveCircleRectCollision(circle: Circle, rect: Rect): CircleRectCollision` — 円が矩形と重なっていれば、貫通量が小さい軸方向にのみ押し出した新しい座標と、どちらの軸で衝突したかを返す。重なっていなければ`collidedX: false, collidedY: false`で元の座標を返す。
  - `isCircleOverlappingRect(circle: Circle, rect: Rect): boolean` — 円と矩形が重なっているかどうかだけを返す（ゴール判定用）。
  - `shouldTriggerWallHaptic(params: { wasTouchingWall: boolean; isTouchingWall: boolean; lastHapticTimestamp: number; now: number; cooldownMs: number }): boolean` — 壁への新規接触かつクールダウン経過済みの場合にのみ`true`を返す。

- [ ] **Step 1: Jestのセットアップ**

```bash
npm install --save-dev jest ts-jest @types/jest
```

`jest.config.js`を新規作成:

```js
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
};
```

`package.json`の`"scripts"`に`"test": "jest"`を追加する。

- [ ] **Step 2: 衝突判定ロジックの失敗するテストを書く**

`components/maze/collision.test.ts`:

```typescript
import { isCircleOverlappingRect, resolveCircleRectCollision } from './collision';

describe('resolveCircleRectCollision', () => {
  const wall = { x: 100, y: 100, width: 50, height: 50 }; // x: 100-150, y: 100-150

  test('円が矩形から十分離れている場合は衝突しない', () => {
    const result = resolveCircleRectCollision({ x: 0, y: 0, radius: 10 }, wall);
    expect(result).toEqual({ x: 0, y: 0, collidedX: false, collidedY: false });
  });

  test('左から侵入した場合はX軸方向に押し出され、Y座標は変わらない', () => {
    const result = resolveCircleRectCollision({ x: 95, y: 125, radius: 10 }, wall);
    expect(result.collidedX).toBe(true);
    expect(result.collidedY).toBe(false);
    expect(result.x).toBeCloseTo(90);
    expect(result.y).toBe(125);
  });

  test('上から侵入した場合はY軸方向に押し出され、X座標は変わらない', () => {
    const result = resolveCircleRectCollision({ x: 125, y: 95, radius: 10 }, wall);
    expect(result.collidedY).toBe(true);
    expect(result.collidedX).toBe(false);
    expect(result.y).toBeCloseTo(90);
    expect(result.x).toBe(125);
  });

  test('角付近では貫通量が小さい軸方向に押し出される', () => {
    const result = resolveCircleRectCollision({ x: 96, y: 92, radius: 10 }, wall);
    expect(result.collidedY).toBe(true);
    expect(result.collidedX).toBe(false);
  });
});

describe('isCircleOverlappingRect', () => {
  const goal = { x: 200, y: 200, width: 40, height: 40 };

  test('重なっていない場合はfalse', () => {
    expect(isCircleOverlappingRect({ x: 0, y: 0, radius: 10 }, goal)).toBe(false);
  });

  test('円の中心が矩形内にある場合はtrue', () => {
    expect(isCircleOverlappingRect({ x: 220, y: 220, radius: 10 }, goal)).toBe(true);
  });

  test('円が矩形の端にわずかに重なっている場合はtrue', () => {
    expect(isCircleOverlappingRect({ x: 195, y: 220, radius: 10 }, goal)).toBe(true);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認**

Run: `npx jest components/maze/collision.test.ts`
Expected: `collision.ts`が存在しないため`Cannot find module './collision'`で失敗する。

- [ ] **Step 4: `collision.ts`を実装**

`components/maze/collision.ts`:

```typescript
export type Circle = { x: number; y: number; radius: number };
export type Rect = { x: number; y: number; width: number; height: number };

export type CircleRectCollision = {
  x: number;
  y: number;
  collidedX: boolean;
  collidedY: boolean;
};

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.max(min, Math.min(value, max));
}

function closestPointOnRect(circle: Circle, rect: Rect): { x: number; y: number } {
  'worklet';
  return {
    x: clamp(circle.x, rect.x, rect.x + rect.width),
    y: clamp(circle.y, rect.y, rect.y + rect.height),
  };
}

/**
 * 円が矩形と重なっている場合、貫通量が小さい軸方向にのみ押し出す。
 * 片方の軸だけを補正することで「壁に沿って滑る」挙動になる。
 *
 * `'worklet'`ディレクティブが必要: この関数はReanimatedの`useFrameCallback`
 * （UIスレッドのworklet）から直接呼び出される。別ファイルからimportした関数は
 * 同一ファイル内のような自動workletize対象にならないため、明示的なディレクティブが必須。
 */
export function resolveCircleRectCollision(circle: Circle, rect: Rect): CircleRectCollision {
  'worklet';
  const closest = closestPointOnRect(circle, rect);
  const dx = circle.x - closest.x;
  const dy = circle.y - closest.y;
  const distanceSquared = dx * dx + dy * dy;

  if (distanceSquared >= circle.radius * circle.radius) {
    return { x: circle.x, y: circle.y, collidedX: false, collidedY: false };
  }

  const penetrationX = circle.radius - Math.abs(dx);
  const penetrationY = circle.radius - Math.abs(dy);

  if (penetrationX < penetrationY) {
    const sign = dx < 0 ? -1 : 1;
    return { x: circle.x + sign * penetrationX, y: circle.y, collidedX: true, collidedY: false };
  }

  const sign = dy < 0 ? -1 : 1;
  return { x: circle.x, y: circle.y + sign * penetrationY, collidedX: false, collidedY: true };
}

// `'worklet'`が必要な理由はresolveCircleRectCollisionと同じ（useFrameCallback内から呼ばれる）。
export function isCircleOverlappingRect(circle: Circle, rect: Rect): boolean {
  'worklet';
  const closest = closestPointOnRect(circle, rect);
  const dx = circle.x - closest.x;
  const dy = circle.y - closest.y;
  return dx * dx + dy * dy < circle.radius * circle.radius;
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npx jest components/maze/collision.test.ts`
Expected: 7件全てPASS。

- [ ] **Step 6: ハプティクス制御の失敗するテストを書く**

`components/maze/haptics-gate.test.ts`:

```typescript
import { shouldTriggerWallHaptic } from './haptics-gate';

describe('shouldTriggerWallHaptic', () => {
  test('壁に触れていない場合はfalse', () => {
    expect(
      shouldTriggerWallHaptic({
        wasTouchingWall: false,
        isTouchingWall: false,
        lastHapticTimestamp: 0,
        now: 1000,
        cooldownMs: 150,
      })
    ).toBe(false);
  });

  test('既に触れていた場合（新規接触でない）はfalse', () => {
    expect(
      shouldTriggerWallHaptic({
        wasTouchingWall: true,
        isTouchingWall: true,
        lastHapticTimestamp: 0,
        now: 1000,
        cooldownMs: 150,
      })
    ).toBe(false);
  });

  test('新規接触かつクールダウン経過済みならtrue', () => {
    expect(
      shouldTriggerWallHaptic({
        wasTouchingWall: false,
        isTouchingWall: true,
        lastHapticTimestamp: 0,
        now: 200,
        cooldownMs: 150,
      })
    ).toBe(true);
  });

  test('新規接触でもクールダウン未経過ならfalse', () => {
    expect(
      shouldTriggerWallHaptic({
        wasTouchingWall: false,
        isTouchingWall: true,
        lastHapticTimestamp: 100,
        now: 200,
        cooldownMs: 150,
      })
    ).toBe(false);
  });
});
```

- [ ] **Step 7: テストが失敗することを確認**

Run: `npx jest components/maze/haptics-gate.test.ts`
Expected: `Cannot find module './haptics-gate'`で失敗する。

- [ ] **Step 8: `haptics-gate.ts`を実装**

`components/maze/haptics-gate.ts`:

```typescript
export type WallHapticGateParams = {
  wasTouchingWall: boolean;
  isTouchingWall: boolean;
  lastHapticTimestamp: number;
  now: number;
  cooldownMs: number;
};

/**
 * 壁との接触が新規に始まったフレーム（wasTouchingWall: false -> isTouchingWall: true）でのみ発火し、
 * かつ前回発火からcooldownMs以上経過している場合のみtrueを返す。
 *
 * `'worklet'`ディレクティブが必要: この関数はReanimatedの`useFrameCallback`
 * （UIスレッドのworklet）から直接呼び出される。別ファイルからimportした関数は
 * 同一ファイル内のような自動workletize対象にならないため、明示的なディレクティブが必須。
 */
export function shouldTriggerWallHaptic(params: WallHapticGateParams): boolean {
  'worklet';
  const { wasTouchingWall, isTouchingWall, lastHapticTimestamp, now, cooldownMs } = params;
  if (!isTouchingWall || wasTouchingWall) {
    return false;
  }
  return now - lastHapticTimestamp >= cooldownMs;
}
```

- [ ] **Step 9: 全テストが通ることを確認**

Run: `npx jest`
Expected: `collision.test.ts`(7件)と`haptics-gate.test.ts`(4件)、合計11件全てPASS。

- [ ] **Step 10: コミット**

```bash
git add package.json jest.config.js components/maze/collision.ts components/maze/collision.test.ts components/maze/haptics-gate.ts components/maze/haptics-gate.test.ts
git commit -m "Add pure collision resolution and wall-haptic cooldown gate with tests"
```

---

## Task 3: 迷路データとゲーム画面（Skia + Reanimated）

**Files:**
- Create: `components/maze/maze-data.ts`
- Create: `components/maze/maze-game.tsx`

**Interfaces:**
- Consumes:
  - `resolveCircleRectCollision`, `isCircleOverlappingRect`（`./collision`、Task 2で定義）
  - `shouldTriggerWallHaptic`（`./haptics-gate`、Task 2で定義）
- Produces:
  - `MAZE_WIDTH: number`, `MAZE_HEIGHT: number`, `BALL_RADIUS: number`, `START_POSITION: {x:number,y:number}`, `GOAL: Rect`, `WALLS: Rect[]`（`./maze-data`）
  - `export function MazeGame(): JSX.Element`（`./maze-game`、Task 4で`explore.tsx`から使用する）

- [ ] **Step 1: 迷路データを定義**

`components/maze/maze-data.ts`:

```typescript
import type { Rect } from './collision';

export const MAZE_WIDTH = 320;
export const MAZE_HEIGHT = 520;
export const WALL_THICKNESS = 14;
export const BALL_RADIUS = 10;

export const START_POSITION = { x: 40, y: 50 };

export const GOAL: Rect = { x: 250, y: 460, width: 40, height: 30 };

export const WALLS: Rect[] = [
  // 外周
  { x: 0, y: 0, width: MAZE_WIDTH, height: WALL_THICKNESS },
  { x: 0, y: MAZE_HEIGHT - WALL_THICKNESS, width: MAZE_WIDTH, height: WALL_THICKNESS },
  { x: 0, y: 0, width: WALL_THICKNESS, height: MAZE_HEIGHT },
  { x: MAZE_WIDTH - WALL_THICKNESS, y: 0, width: WALL_THICKNESS, height: MAZE_HEIGHT },
  // 内部の壁（右→左→右→左とジグザグに隙間を通らせる固定レイアウト）
  { x: WALL_THICKNESS, y: 110, width: 226, height: WALL_THICKNESS },
  { x: 80, y: 210, width: 226, height: WALL_THICKNESS },
  { x: WALL_THICKNESS, y: 310, width: 226, height: WALL_THICKNESS },
  { x: 80, y: 410, width: 226, height: WALL_THICKNESS },
];
```

- [ ] **Step 2: ゲーム画面を実装**

`components/maze/maze-game.tsx`:

```typescript
import { Canvas, Circle, Rect as SkiaRect } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { Accelerometer } from 'expo-sensors';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { runOnJS, useFrameCallback, useSharedValue } from 'react-native-reanimated';

import { isCircleOverlappingRect, resolveCircleRectCollision } from './collision';
import { shouldTriggerWallHaptic } from './haptics-gate';
import { BALL_RADIUS, GOAL, MAZE_HEIGHT, MAZE_WIDTH, START_POSITION, WALLS } from './maze-data';

const TILT_SENSITIVITY = 900; // px/s^2 (1g傾き相当あたりの加速度)
const FRICTION_PER_FRAME = 0.995;
const MAX_SPEED = 260; // px/s
const HAPTIC_COOLDOWN_MS = 150;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.max(min, Math.min(value, max));
}

export function MazeGame() {
  const ballX = useSharedValue(START_POSITION.x);
  const ballY = useSharedValue(START_POSITION.y);
  const velocityX = useSharedValue(0);
  const velocityY = useSharedValue(0);
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const isTouchingWall = useSharedValue(false);
  const lastHapticTimestamp = useSharedValue(0);
  const gameStatus = useSharedValue<'playing' | 'won'>('playing');
  const [showWinOverlay, setShowWinOverlay] = useState(false);

  useEffect(() => {
    Accelerometer.setUpdateInterval(16);
    const subscription = Accelerometer.addListener(({ x, y }) => {
      tiltX.value = x;
      tiltY.value = -y;
    });
    return () => subscription.remove();
  }, [tiltX, tiltY]);

  const fireWallHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const fireWinHaptic = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const handleWin = useCallback(() => {
    setShowWinOverlay(true);
  }, []);

  useFrameCallback((frameInfo) => {
    if (gameStatus.value !== 'playing') {
      return;
    }
    const dt = (frameInfo.timeSincePreviousFrame ?? 16) / 1000;

    velocityX.value = clamp(
      (velocityX.value + tiltX.value * TILT_SENSITIVITY * dt) * FRICTION_PER_FRAME,
      -MAX_SPEED,
      MAX_SPEED
    );
    velocityY.value = clamp(
      (velocityY.value + tiltY.value * TILT_SENSITIVITY * dt) * FRICTION_PER_FRAME,
      -MAX_SPEED,
      MAX_SPEED
    );

    let nextX = ballX.value + velocityX.value * dt;
    let nextY = ballY.value + velocityY.value * dt;
    let touchingWallThisFrame = false;

    for (const wall of WALLS) {
      const collision = resolveCircleRectCollision({ x: nextX, y: nextY, radius: BALL_RADIUS }, wall);
      if (collision.collidedX || collision.collidedY) {
        touchingWallThisFrame = true;
        nextX = collision.x;
        nextY = collision.y;
        if (collision.collidedX) {
          velocityX.value = 0;
        }
        if (collision.collidedY) {
          velocityY.value = 0;
        }
      }
    }

    ballX.value = nextX;
    ballY.value = nextY;

    const now = frameInfo.timestamp;
    if (
      shouldTriggerWallHaptic({
        wasTouchingWall: isTouchingWall.value,
        isTouchingWall: touchingWallThisFrame,
        lastHapticTimestamp: lastHapticTimestamp.value,
        now,
        cooldownMs: HAPTIC_COOLDOWN_MS,
      })
    ) {
      lastHapticTimestamp.value = now;
      runOnJS(fireWallHaptic)();
    }
    isTouchingWall.value = touchingWallThisFrame;

    if (isCircleOverlappingRect({ x: nextX, y: nextY, radius: BALL_RADIUS }, GOAL)) {
      gameStatus.value = 'won';
      runOnJS(fireWinHaptic)();
      runOnJS(handleWin)();
    }
  });

  const resetGame = useCallback(() => {
    ballX.value = START_POSITION.x;
    ballY.value = START_POSITION.y;
    velocityX.value = 0;
    velocityY.value = 0;
    isTouchingWall.value = false;
    lastHapticTimestamp.value = 0;
    gameStatus.value = 'playing';
    setShowWinOverlay(false);
  }, [ballX, ballY, velocityX, velocityY, isTouchingWall, lastHapticTimestamp, gameStatus]);

  return (
    <View style={styles.container}>
      <Canvas style={{ width: MAZE_WIDTH, height: MAZE_HEIGHT }}>
        <SkiaRect x={0} y={0} width={MAZE_WIDTH} height={MAZE_HEIGHT} color="#1e293b" />
        {WALLS.map((wall, index) => (
          <SkiaRect key={index} x={wall.x} y={wall.y} width={wall.width} height={wall.height} color="#64748b" />
        ))}
        <SkiaRect x={GOAL.x} y={GOAL.y} width={GOAL.width} height={GOAL.height} color="#22c55e" />
        <Circle cx={ballX} cy={ballY} r={BALL_RADIUS} color="#f97316" />
      </Canvas>
      {showWinOverlay && (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>ゴール！🎉</Text>
          <Pressable style={styles.button} onPress={resetGame}>
            <Text style={styles.buttonText}>もう一度</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
  },
  overlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 16,
    paddingVertical: 32,
    paddingHorizontal: 40,
  },
  overlayText: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#22c55e',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  buttonText: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '600',
  },
});
```

- [ ] **Step 3: 型チェックを実行**

Run: `npx tsc --noEmit`
Expected: エラーなしで終了する。

- [ ] **Step 4: コミット**

```bash
git add components/maze/maze-data.ts components/maze/maze-game.tsx
git commit -m "Add maze layout data and Skia+Reanimated maze game screen"
```

---

## Task 4: Exploreタブへの組み込み

**Files:**
- Modify: `app/(tabs)/explore.tsx`（既存内容を`<MazeGame />`に置き換え）
- Modify: `app/(tabs)/_layout.tsx`（タブタイトルとアイコンを変更）
- Modify: `components/ui/icon-symbol.tsx`（`gamecontroller.fill`のマッピングを追加）

**Interfaces:**
- Consumes: `MazeGame`（`@/components/maze/maze-game`、Task 3で定義）
- Produces: なし（末端の画面）

- [ ] **Step 1: `explore.tsx`を置き換え**

`app/(tabs)/explore.tsx`の内容を全て以下に置き換える:

```typescript
import { MazeGame } from '@/components/maze/maze-game';

export default function ExploreScreen() {
  return <MazeGame />;
}
```

- [ ] **Step 2: アイコンマッピングを追加**

`components/ui/icon-symbol.tsx`の`MAPPING`に以下を追加する:

```typescript
const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'gamecontroller.fill': 'sports-esports',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
} as IconMapping;
```

- [ ] **Step 3: タブのタイトルとアイコンを変更**

`app/(tabs)/_layout.tsx`の`explore`タブの`Tabs.Screen`を以下に変更する:

```typescript
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Maze',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gamecontroller.fill" color={color} />,
        }}
      />
```

- [ ] **Step 4: 型チェックとLintを実行**

Run: `npx tsc --noEmit && npm run lint`
Expected: どちらもエラーなしで終了する。

- [ ] **Step 5: コミット**

```bash
git add "app/(tabs)/explore.tsx" "app/(tabs)/_layout.tsx" components/ui/icon-symbol.tsx
git commit -m "Wire maze game into the Explore tab with a game controller icon"
```

---

## Task 5: 実機での手動確認

**このタスクにコード変更は必須ではない。** Accelerometerによる操作感はシミュレーターでは再現できないため、物理デバイスでの確認が必要。

**Files:**
- Modify（必要な場合のみ）: `components/maze/maze-game.tsx`（`TILT_SENSITIVITY` / `FRICTION_PER_FRAME` / `MAX_SPEED`の調整、または`tiltY.value = -y`の符号調整）

- [ ] **Step 1: 開発用クライアントをビルドして実機にインストール**

Skiaはネイティブコードを含むため、Expo Goでは動作しない。以下のいずれかを実行する:

```bash
npx expo run:ios --device
# もしくは
npx expo run:android --device
```

- [ ] **Step 2: 動作確認チェックリスト**

実機で以下を確認する:

- [ ] 端末を傾けるとボールが傾けた方向に転がる（上下が逆に感じる場合は`maze-game.tsx`の`tiltY.value = -y;`を`tiltY.value = y;`に変更する）
- [ ] 壁にぶつかるとボールが止まり、跳ね返らずに壁に沿って滑る
- [ ] 壁への接触開始時にハプティクスが1回発火し、壁に沿って滑っている間は連続で震え続けない
- [ ] ゴールに到達すると成功ハプティクスと「ゴール！🎉」のオーバーレイが表示される
- [ ] 「もう一度」を押すとボールがスタート位置に戻り、再度操作できる
- [ ] ボールの速度が遅すぎる/速すぎると感じた場合は`TILT_SENSITIVITY`・`FRICTION_PER_FRAME`・`MAX_SPEED`を調整して再ビルドする

- [ ] **Step 3: 定数を調整した場合のみコミット**

```bash
git add components/maze/maze-game.tsx
git commit -m "Tune tilt sensitivity based on physical device testing"
```

---

## Self-Review メモ

- **仕様カバレッジ**: Accelerometer採用／Skia描画／固定1面／壁スライド衝突／150msクールダウン付きハプティクス／ゴール演出とリセット／`ios.bundleIdentifier`／`NSMotionUsageDescription`／実機確認の必要性 — 全てTask 1〜5でカバー済み。
- **プレースホルダー確認**: 「TBD」「後で実装」等の記述なし。すべてのコードステップに実際のコードを記載済み。
- **型・シグネチャの整合性**: `Rect`/`Circle`/`CircleRectCollision`の型はTask 2で定義し、Task 3の`maze-data.ts`・`maze-game.tsx`で同じ形状のオブジェクトを使用（構造的型付けのため`Rect`型を`maze-data.ts`でも再importして使用）。`resolveCircleRectCollision`・`isCircleOverlappingRect`・`shouldTriggerWallHaptic`の関数名・引数はTask 2〜3で一致。
- **本プランの前提**: GitHub Actions/Sideloadly配布のプラン（`docs/superpowers/plans/2026-08-02-ci-sideload-distribution.md`）は、本プランのTask 1（`app.json`のbundleIdentifier設定）が完了していることを前提とする。
