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

  test('右から侵入した場合はX軸方向に押し出され、Y座標は変わらない', () => {
    const result = resolveCircleRectCollision({ x: 155, y: 125, radius: 10 }, wall);
    expect(result.collidedX).toBe(true);
    expect(result.collidedY).toBe(false);
    expect(result.x).toBeCloseTo(160);
    expect(result.y).toBe(125);
  });

  test('下から侵入した場合はY軸方向に押し出され、X座標は変わらない', () => {
    const result = resolveCircleRectCollision({ x: 125, y: 155, radius: 10 }, wall);
    expect(result.collidedY).toBe(true);
    expect(result.collidedX).toBe(false);
    expect(result.y).toBeCloseTo(160);
    expect(result.x).toBe(125);
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

  test('距離が半径とちょうど等しい場合は重なりとみなさない（境界値）', () => {
    expect(isCircleOverlappingRect({ x: 190, y: 220, radius: 10 }, goal)).toBe(false);
  });
});
