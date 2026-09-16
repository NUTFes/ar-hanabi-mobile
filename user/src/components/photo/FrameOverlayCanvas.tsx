import { useEffect, useState, type RefObject } from 'react';
import { drawPhotoFrame, preloadFrameLogo, type PhotoFrameId } from '../../lib/photoFrames';
import { frameOverlayStyle } from '../../pages/photoStyles';

interface Props {
  frameId: PhotoFrameId;
  /** 撮影時にこのcanvasをそのまま合成するため、呼び出し側が実体を持つ */
  canvasRef: RefObject<HTMLCanvasElement>;
}

/**
 * フォトフレームの画面プレビュー。
 *
 * ここで描いたcanvasは、写真・動画の合成（mediaCapture.ts）でもそのまま重ねられる。
 * 保存時にフレームを描き直すのではなく同じ絵を使うので、
 * 「画面には枠が出ているのに保存した写真には入っていない」という食い違いが起きない。
 */
export default function FrameOverlayCanvas({ frameId, canvasRef }: Props) {
  // ロゴは非同期に読み込まれるので、届いた時点で描き直す
  const [logoVersion, setLogoVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    preloadFrameLogo().then(() => {
      if (!cancelled) setLogoVersion((prev) => prev + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(window.innerWidth * dpr);
      const height = Math.round(window.innerHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      drawPhotoFrame(ctx, width, height, frameId);
    };

    draw();
    // 画面回転やアドレスバーの出入りで寸法が変わるため追従させる
    window.addEventListener('resize', draw);
    window.addEventListener('orientationchange', draw);
    return () => {
      window.removeEventListener('resize', draw);
      window.removeEventListener('orientationchange', draw);
    };
  }, [frameId, logoVersion, canvasRef]);

  return <canvas ref={canvasRef} style={frameOverlayStyle} aria-hidden />;
}
