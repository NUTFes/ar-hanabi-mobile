import { useCallback, useEffect, useRef, useState } from 'react';

// ===== 「タップしたところに花火が上がるよ」の表示タイミング =====
//
// 一度使い方が分かった人にずっと出し続けると花火が隠れるので、
// 1回でも打ち上げたら消す。ただし「消えたきり二度と出ない」ようにはしない。
//
// 出す条件は次の3つ。
//  1. ページを開いた直後（リロード・閉じて開き直しを含む）は必ず出す
//  2. 写真撮影モードに入ったとき、最後の打ち上げから時間が経っていたら出す
//  3. 打ち上げたあと、しばらく何も上がらなければ「操作が分からなくなった」とみなして出し直す
//
// 表示の判断はすべて「最後に花火が上がった時刻」から導く。打ち上げの瞬間だけを見て
// タイマーを張ると、途中でモードを行き来したときにタイマーが消えて二度と出なくなるため。

/** 最終の打ち上げ時刻の保存先。ページを閉じても残るので「久しぶりに開いた」が判定できる */
const LAST_LAUNCH_KEY = 'arHanabi.photoTapHint.lastLaunchAt';

/** 打ち上げが止まってからこれだけ経ったら、操作が分からなくなったとみなして再表示する */
export const HINT_IDLE_RESHOW_MS = 20000;

/** 最終の打ち上げからこれだけ経っていれば「久しぶり」とみなし、モード切替時にも出す */
export const HINT_STALE_MS = 5 * 60 * 1000;

function readLastLaunchAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_LAUNCH_KEY);
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    // プライベートモード等で localStorage が使えない場合は「記録なし」として扱う
    return null;
  }
}

function writeLastLaunchAt(at: number): void {
  try {
    localStorage.setItem(LAST_LAUNCH_KEY, String(at));
  } catch {
    // 保存できなくてもヒントの表示自体は動くので握りつぶす
  }
}

export type TapHintState = {
  /** ヒントを表示するか（フェードは表示側のCSSが担当する） */
  isHintVisible: boolean;
  /** 花火が上がったことを伝える。これでヒントが消え、再表示の予約が入る */
  notifyLaunched: () => void;
};

/**
 * @param active ヒントを出しうる状態か（写真撮影モードで、かつ花火が打ち上げ可能なとき true）
 */
export function useTapHint(active: boolean): TapHintState {
  const [isHintVisible, setIsHintVisible] = useState(false);
  // このページを開いてから一度も active になっていないなら、初回表示として必ず出す
  const hasActivatedRef = useRef(false);
  // 最終の打ち上げ時刻。初期値は前回の訪問時のもの（localStorage）
  const lastLaunchAtRef = useRef<number | null>(null);
  const isLastLaunchLoadedRef = useRef(false);
  // notifyLaunched から表示判断のeffectを走らせ直すためのカウンタ
  const [launchTick, setLaunchTick] = useState(0);

  if (!isLastLaunchLoadedRef.current) {
    lastLaunchAtRef.current = readLastLaunchAt();
    isLastLaunchLoadedRef.current = true;
  }

  useEffect(() => {
    if (!active) {
      setIsHintVisible(false);
      return;
    }

    const isFirstActivation = !hasActivatedRef.current;
    hasActivatedRef.current = true;
    // ページを開いた直後は、前回いつ上げていようが必ず出す
    if (isFirstActivation) {
      setIsHintVisible(true);
      return;
    }

    const lastLaunchAt = lastLaunchAtRef.current;
    const elapsed = lastLaunchAt === null ? Infinity : Date.now() - lastLaunchAt;
    // まだ一度も上げていない／久しぶりに戻ってきたなら、すぐ出す
    if (elapsed > HINT_STALE_MS) {
      setIsHintVisible(true);
      return;
    }

    // 直前に上げたばかりなら隠しておき、手が止まったところで出し直す。
    // 残り時間は経過ぶんを差し引くので、モードを行き来しても再表示が先送りされない
    setIsHintVisible(false);
    const timerId = window.setTimeout(
        () => setIsHintVisible(true),
        Math.max(HINT_IDLE_RESHOW_MS - elapsed, 0),
    );
    return () => window.clearTimeout(timerId);
  }, [active, launchTick]);

  const notifyLaunched = useCallback(() => {
    const now = Date.now();
    lastLaunchAtRef.current = now;
    writeLastLaunchAt(now);
    // effectを走らせ直す。ヒントを隠し、再表示のタイマーを張り直すのはeffectの役目
    setLaunchTick((prev) => prev + 1);
  }, []);

  return { isHintVisible, notifyLaunched };
}
