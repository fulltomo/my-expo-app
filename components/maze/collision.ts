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
