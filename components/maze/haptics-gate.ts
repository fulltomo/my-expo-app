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
