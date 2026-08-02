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
