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
