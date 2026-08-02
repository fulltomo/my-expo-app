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
