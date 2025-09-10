import { 
  useState, 
  forwardRef, 
  useImperativeHandle, 
  useEffect,
  useMemo,
  useCallback,
  useRef
} from 'react'
import * as THREE from 'three';
import IllustrationFireworks from '../components/fireworks/Illustration/IllustrationFireworks';
import PeonyFireworks from '../components/fireworks/PeonyFireworks/PeonyFireworks';
import ChrysanthemumFireworks from '../components/fireworks/ChrysanthemumFireworks/ChrysanthemumFireworks';
import type { 
  FinaleTimelineEntry, 
  ActiveFirework
} from '../types/finaleTimelineType';
import { FireworkType } from '../types/finaleTimelineType';
import { 
  parseFinaleTimeline, 
  calculateTotalDuration, 
  getColorCode, 
  convertCoordinates 
} from '../utils/csvParser';
import { useFinaleTimer } from '../hooks/useFinaleTimer';
// CSVファイルをテキストとしてインポート
// import finaleTimelineData from '../assets/finale_timeline.csv?raw';  // 通常ver
// import finaleTimelineData from '../assets/finale_timeline_mini.csv?raw'; // 打ち上げ頻度を0.5小節ごとにしたver
import finaleTimelineData from '../assets/finale_timeline_minimum.csv?raw'; // 打ち上げ頻度を0.5小節にし、花火の個数も減らしたver
import SenrinGikuFireworks from '../components/fireworks/SenrinGiku/SenrinGikuFireworks';
import { 
  logo,
  finaleIllust1,
  finaleIllust2,
  finaleIllust3,
  finaleIllust4,
  finaleIllust5,
  finaleIllust6,
  finaleIllust7,
} from '../components/fireworks/Illustration/StaticPixelData/staticPixelData.ts';


// コンポーネントの外部から呼び出せる関数を定義
export type FinaleSceneHandle = {
  startFinale: () => void;        // フィナーレ開始
  pauseFinale: () => void;        // フィナーレ一時停止
  resetFinale: () => void;        // フィナーレリセット
  getCurrentTime: () => number;   // 現在時刻を取得
  getTotalDuration: () => number; // 総時間を取得
  getProgress: () => number;      // 進行状況を取得(0-100%)
  isPlaying: () => boolean;       // 再生中かどうか
}

// ===== FinaleSceneコンポーネント =====
// CSVタイムラインに基づいて自動的に花火を打ち上げるシーン
const FinaleScene = forwardRef<FinaleSceneHandle>(( _, ref) => {
  
  // タイムラインデータの解析
  const timeline = useMemo(() => {
    const parsed = parseFinaleTimeline(finaleTimelineData);
    console.log('Parsed timeline:', parsed.length, 'entries');
    return parsed;
  }, []);
  
  const totalDuration = useMemo(() => {
    return calculateTotalDuration(timeline);
  }, [timeline]);
  
  // アクティブな花火の状態管理
  const [activeFireworks, setActiveFireworks] = useState<ActiveFirework[]>([]);
  
  console.log('Active fireworks count:', activeFireworks.length);
  
  // 花火の種類に応じて適切なコンポーネントを選択
  const getFireworkComponent = useCallback((type: string) => {
    switch(type) {
      case FireworkType.LOGO:           // '44ロゴ'
      case FireworkType.ILLUST1:        // 'イラスト1'
      case FireworkType.ILLUST2:        // 'イラスト2'
      case FireworkType.ILLUST3:        // 'イラスト3'
      case FireworkType.ILLUST4:        // 'イラスト4'
      case FireworkType.ILLUST5:        // 'イラスト5'
      case FireworkType.ILLUST6:        // 'イラスト6'
      case FireworkType.ILLUST7:        // 'イラスト7'
        return IllustrationFireworks;
      case FireworkType.PEONY:          // '牡丹'
        return PeonyFireworks;
      case FireworkType.CHRYSANTHEMUM:  // '菊'
        return ChrysanthemumFireworks;
      case FireworkType.SENRIN:         // '千輪'
        return SenrinGikuFireworks;
      default:
        console.warn(`Unknown firework type: ${type}, using PeonyFireworks as fallback`);
        return PeonyFireworks;
    }
  }, []);
  
  // 花火の打ち上げコールバック
  const handleFireworkLaunch = useCallback((entries: FinaleTimelineEntry[]) => {
    const newFireworks: ActiveFirework[] = entries.map(entry => {
      const id = crypto.randomUUID();
      const color = new THREE.Color(getColorCode(entry.color));
      const from = new THREE.Vector3(...convertCoordinates(entry.launchPosition));
      const to = new THREE.Vector3(...convertCoordinates(entry.explodePosition));
      const isSoundEnabled = entry.hasSound;

      console.log(`Creating firework: ${entry.type} at ${entry.timestamp}s`);
      console.log(`  Raw launch: [${entry.launchPosition.join(', ')}] -> Converted: [${from.x}, ${from.y}, ${from.z}]`);
      console.log(`  Raw explode: [${entry.explodePosition.join(', ')}] -> Converted: [${to.x}, ${to.y}, ${to.z}]`);
      console.log(`  Color: ${entry.color} -> ${color.getHexString()}`);

      return {
        id,
        entry,
        from,
        to,
        color,
        isSoundEnabled
      };
    });
    
    setActiveFireworks(prev => [...prev, ...newFireworks]);
  }, []);
  
  // タイマーフックを使用
  const { 
    timerState, 
    startFinale, 
    pauseFinale, 
    resetFinale
  } = useFinaleTimer({
    timeline,
    onFireworkLaunch: handleFireworkLaunch,
    totalDuration
  });
  
  // BGM用のAudio要素のref
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  
  // BGMの初期化
  useEffect(() => {
    bgmRef.current = new Audio('/audio/finale_bgm.mp3');
    bgmRef.current.loop = true; // ループ再生
    bgmRef.current.volume = 0.5; // 音量調整（0.0-1.0）
    
    // コンポーネントのアンマウント時にクリーンアップ
    return () => {
      if (bgmRef.current) {
        bgmRef.current.pause();
        bgmRef.current.currentTime = 0;
        bgmRef.current = null;
      }
    };
  }, []);
  
  // 再生状態の監視とBGM制御
  useEffect(() => {
    if (!bgmRef.current) return;
    
    if (timerState.isPlaying) {
      // フィナーレ開始時にBGM再生
      bgmRef.current.play().catch(error => {
        console.error('BGM playback failed:', error);
        console.log('User interaction may be required for audio playback');
      });
    } else {
      // 一時停止時にBGM停止
      bgmRef.current.pause();
    }
  }, [timerState.isPlaying]);
  
  // リセット時にBGMを最初から再生するように設定
  useEffect(() => {
    if (bgmRef.current && timerState.currentTime === 0 && !timerState.isPlaying) {
      bgmRef.current.currentTime = 0; // BGMを最初に戻す
    }
  }, [timerState.currentTime, timerState.isPlaying]);
  
  
  // 花火が終了したときの処理
  const onFireworkFinished = useCallback((id: string) => {
    setActiveFireworks(prev => prev.filter(fw => fw.id !== id));
    console.log('Firework finished:', id);
  }, []);
  
  // リセット時にアクティブな花火も削除
  useEffect(() => {
    if (timerState.currentTime === 0 && !timerState.isPlaying) {
      setActiveFireworks([]);
    }
  }, [timerState.currentTime, timerState.isPlaying]);
  
  // コンポーネントの外部から呼び出せる関数を定義
  useImperativeHandle(ref, () => ({
    startFinale,
    pauseFinale,
    resetFinale,
    getCurrentTime: () => timerState.currentTime,
    getTotalDuration: () => totalDuration,
    getProgress: () => totalDuration > 0 ? (timerState.currentTime / totalDuration) * 100 : 0,
    isPlaying: () => timerState.isPlaying,
  }));
  
  // 花火コンポーネントの共通props
  const getFireworkProps = useCallback((fw: ActiveFirework) => {
    // const explodingHeight = 20; // 花火の打ち上げ高さ
    // const explosionRadius = fw.entry.type === FireworkType.LOGO ? 3 : 1; // ロゴは大きめ
    
    // ActiveFireworkからfromとtoの座標を直接使用
    const fromPos = fw.from.clone(); // 打ち上げ座標
    const toPos = fw.to.clone();     // 開花座標

    // // 開花位置のY座標が打ち上げ位置と同じ場合は、高さを調整
    // if (Math.abs(toPos.y - fromPos.y) < 0.1) {
    //   toPos.y = fromPos.y + explodingHeight;
    // }
    
    console.log(`Firework ${fw.id}: from (${fromPos.x}, ${fromPos.y}, ${fromPos.z}) to (${toPos.x}, ${toPos.y}, ${toPos.z})`);
    
    return {
      from: fromPos,
      to: toPos,
      color: fw.color,
      // size: explosionRadius,
      isSoundEnabled: fw.isSoundEnabled,
      onComplete: () => onFireworkFinished(fw.id),
    };
  }, [onFireworkFinished]);
  
  return (
    <>
      {activeFireworks.map((fw) => {
        const FireworkComponent = getFireworkComponent(fw.entry.type);
        const props = getFireworkProps(fw);
        let data;
        let size;
        // let starSize;
        
        // イラスト花火の場合は静的なpixelDataを渡す
        if (FireworkComponent === IllustrationFireworks) {
          switch (fw.entry.type) {
            case FireworkType.LOGO:     // ロゴ
              data = logo;
              size = 3;
              // starSize = 0.6;
              break;
            case FireworkType.ILLUST1:  // ご来場ありがとうございましたのイラスト
              data = finaleIllust1;
              size = 5;
              break;
            case FireworkType.ILLUST2:
              data = finaleIllust2;
              size = 5;
              break;
            case FireworkType.ILLUST3:
              data = finaleIllust3;
              size = 5;
              break;
            case FireworkType.ILLUST4:
              data = finaleIllust4;
              size = 5;
              break;
            case FireworkType.ILLUST5:
              data = finaleIllust5;
              size = 5;
              break;
            case FireworkType.ILLUST6:
              data = finaleIllust6;
              size = 5;
              break;
            case FireworkType.ILLUST7:
              data = finaleIllust7;
              size = 5;
              break;
            default:
              // デフォルトはロゴを表示
              console.warn(`No matching illustration for type: ${fw.entry.type}, defaulting to logo`);
              data = logo;
              size = 2;
              break;
          }
          return (
            <IllustrationFireworks
              key={fw.id}
              {...props}
              data={data} // イラストデータを渡す
              size={size} // サイズを渡す
              starSize={0.6} // 星のサイズを渡す
            />
          );
        }
        
        // 牡丹・菊の場合
        if (fw.entry.type === FireworkType.PEONY) {
          return (
            <PeonyFireworks
              key={fw.id}
              {...props}
              segments={10} // 分割数を指定
              starSize={1} // 星のサイズを指定
            />
          );
        }
        
        if (fw.entry.type === FireworkType.CHRYSANTHEMUM) {
          return (
            <ChrysanthemumFireworks
              key={fw.id}
              {...props}
              segments={10} // 分割数を指定
              starSize={0.5} // 星のサイズを指定
            />
          );
        }

        if (fw.entry.type === FireworkType.SENRIN) {
          return (
            <SenrinGikuFireworks
              key={fw.id}
              {...props}
              petalCount={20}
            />
          );
        }

        // デフォルトフォールバック（牡丹）
        return (
          // <PeonyFireworks
          //   key={fw.id}
          //   {...props}
          // />
          <></>
        );
      })}
    </>
  );
});

export default FinaleScene;