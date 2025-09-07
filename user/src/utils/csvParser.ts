import type { FinaleTimelineEntry, ColorMapping } from '../types/finaleTimelineType';

// 色名から16進色コードへのマッピング
const colorMap: ColorMapping = {
  'red': '#d64141',
  'blue': '#2192de',
  'green': '#5ed872',
  'yellow': '#ffff00',
  'white': '#FFFFFF',
  'purple': '#aa28e6',
  'orange': '#e19d1f',
  'indigo': '#1a58f5',
  'bluegreen': '#00FFFF',
  'pink': '#f31f9a',
  // 空文字列の場合のデフォルト色
  '': '#FFFFFF'
};

/**
 * CSV文字列をパースしてFinaleTimelineEntryの配列に変換
 * @param csvText - CSVファイルの内容
 * @returns FinaleTimelineEntry配列
 */
export function parseFinaleTimeline(csvText: string): FinaleTimelineEntry[] {
  const lines = csvText.trim().split('\n');
  const entries: FinaleTimelineEntry[] = [];

  for (const line of lines) {
    if (!line.trim()) continue; // 空行をスキップ

    // CSVの各列を解析
    const columns = line.split(',').map(col => col.trim());
    
    if (columns.length < 9) {
      console.warn('Invalid CSV line (insufficient columns):', line);
      continue;
    }

    try {
      const entry: FinaleTimelineEntry = {
        type: columns[0],                           // 花火の種類
        timestamp: parseFloat(columns[1]),          // 打ち上げ時刻
        color: columns[2],                          // 色
        hasSound: columns[3].toUpperCase() === 'TRUE', // 音の有無
        launchPosition: [                           // 打ち上げ座標
          parseFloat(columns[4]),  // x
          parseFloat(columns[5]),  // y  
          parseFloat(columns[6])   // z
        ],
        explodePosition: [                          // 開花座標
          parseFloat(columns[7]),  // x
          parseFloat(columns[8]),  // y
          parseFloat(columns[9]) || parseFloat(columns[6]) // z (列9がない場合は列6を使用)
        ]
      };

      // 無効な数値をチェック
      if (isNaN(entry.timestamp)) {
        console.warn('Invalid timestamp in CSV line:', line);
        continue;
      }
      
      // 座標の確認ログ（デバッグ用）
      if (entry.launchPosition[0] !== 0 || entry.explodePosition[0] !== 0) {
        console.log(`CSV Parse: ${entry.type} at ${entry.timestamp}s, launch: [${entry.launchPosition.join(', ')}], explode: [${entry.explodePosition.join(', ')}]`);
      }

      entries.push(entry);
    } catch (error) {
      console.warn('Error parsing CSV line:', line, error);
      continue;
    }
  }

  // タイムスタンプでソート
  entries.sort((a, b) => a.timestamp - b.timestamp);

  console.log(`Parsed ${entries.length} timeline entries`);
  return entries;
}

/**
 * 花火大会の総実行時間を計算
 * @param timeline - タイムラインエントリ配列
 * @returns 総時間（秒）
 */
export function calculateTotalDuration(timeline: FinaleTimelineEntry[]): number {
  if (timeline.length === 0) return 0;
  
  const lastEntry = timeline[timeline.length - 1];
  // 最後の花火から追加で3秒の余裕を持たせる
  return lastEntry.timestamp + 3;
}

/**
 * 色名を16進色コードに変換
 * @param colorName - 色名
 * @returns 16進色コード
 */
export function getColorCode(colorName: string): string {
  return colorMap[colorName] || colorMap[''];
}

/**
 * CSVの座標をThree.js座標系に変換
 * @param csvPosition - CSV座標 [x, y, z]
 * @param scale - スケール調整（デフォルト: 2）
 * @returns 変換後の座標 [x, y, z]
 */
export function convertCoordinates(
  csvPosition: [number, number, number], 
  scale: number = 1
): [number, number, number] {
  const converted: [number, number, number] = [
    csvPosition[0] * scale,  // X軸スケール調整
    csvPosition[1],          // Y軸はそのまま（基本的に-10から開始）
    csvPosition[2] * scale   // Z軸スケール調整
  ];
  
  // デバッグログ（X座標が0以外の場合のみ）
  if (csvPosition[0] !== 0) {
    console.log(`Coordinate conversion: [${csvPosition.join(', ')}] -> [${converted.join(', ')}] (scale: ${scale})`);
  }
  
  return converted;
}

/**
 * 特定の時刻に発射すべき花火を取得
 * @param timeline - タイムラインエントリ配列
 * @param currentTime - 現在時刻（秒）
 * @param tolerance - 時刻の許容誤差（秒、デフォルト: 0.1）
 * @returns 発射すべき花火の配列
 */
export function getFireworksAtTime(
  timeline: FinaleTimelineEntry[], 
  currentTime: number, 
  tolerance: number = 0.1
): FinaleTimelineEntry[] {
  return timeline.filter(entry => 
    Math.abs(entry.timestamp - currentTime) <= tolerance
  );
}

/**
 * 現在時刻までに発射されるべき全ての花火を取得
 * @param timeline - タイムラインエントリ配列
 * @param currentTime - 現在時刻（秒）
 * @returns 発射されるべき花火の配列
 */
export function getFireworksUpToTime(
  timeline: FinaleTimelineEntry[], 
  currentTime: number
): FinaleTimelineEntry[] {
  return timeline.filter(entry => entry.timestamp <= currentTime);
}
