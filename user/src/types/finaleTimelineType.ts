import * as THREE from 'three';

// CSVタイムラインの1行分のデータ型
export interface FinaleTimelineEntry {
  type: string;           // 花火の種類 (44ロゴ, 牡丹, 菊)
  timestamp: number;      // 打ち上げ時刻 (秒)
  color: string;          // 花火の色
  hasSound: boolean;      // 音の有無
  launchPosition: [number, number, number];  // 打ち上げ座標 [x, y, z]
  explodePosition: [number, number, number]; // 開花座標 [x, y, z]
}

// アクティブな花火の状態管理用型
export interface ActiveFirework {
  id: string;                    // 一意識別子
  entry: FinaleTimelineEntry;    // タイムラインエントリ
  // position: THREE.Vector3;       // Three.js座標
  from: THREE.Vector3;       // 打ち上げ位置のThree.js座標
  to: THREE.Vector3;         // 開花位置のThree.js座標
  color?: THREE.Color;           // Three.js色オブジェクト
  isSoundEnabled: boolean  // 音の有無
}

// タイマー制御の状態型
export interface FinaleTimerState {
  isPlaying: boolean;       // 再生中かどうか
  currentTime: number;      // 現在の経過時間 (秒)
  totalDuration: number;    // 全体の長さ (秒)
  startTime: number | null; // 開始時刻 (performance.now())
  pausedTime: number;       // 一時停止時の累積時間
}

// 花火の種類定数
export const FireworkType = {
  LOGO: '44ロゴ',
  PEONY: '牡丹',
  CHRYSANTHEMUM: '菊'
} as const;

export type FireworkTypeValue = typeof FireworkType[keyof typeof FireworkType];

// 色マッピング用の型
export interface ColorMapping {
  [key: string]: string;
}
