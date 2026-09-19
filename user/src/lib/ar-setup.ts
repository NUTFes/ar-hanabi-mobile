// src/ar-setup.ts
import * as THREE from 'three';

// THREEx AR.js型定義
declare global {
	interface Window {
		THREEx: {
			ArToolkitSource: any;
			ArToolkitContext: any;
			ArMarkerControls: any;
		};
	}
}

// ARToolkit型を定義
interface ARToolkitSource {
	domElement: HTMLElement;
	ready: boolean;
	init(onReady?: () => void): void;
	onResizeElement(): void;
	copyElementSizeTo(element: HTMLElement): void;
}

export function initializeAR(
	scene: THREE.Scene,
	// camera.projectionMatrix にはもう触れない（R3Fの自動計算に任せる）ため未使用。
	// renderer.domElement（R3Fのcanvas）にも同様の理由で触れない。呼び出し側の引数
	// （initializeAR(scene, camera, gl)）は3ファイルとも変えずに済むよう残している
	_camera: THREE.Camera,
	_renderer: THREE.WebGLRenderer
): {
	arToolkitSource: ARToolkitSource;
	arToolkitContext: any;
	markerRoot: THREE.Group;
	videoElement: HTMLVideoElement;
	videoTexture: THREE.VideoTexture;
	/** window の resize リスナー等の後片付け。呼び出し側のアンマウント時に呼ぶこと */
	dispose: () => void;
} {
	// コンソールでTHREExオブジェクトの内容を確認（デバッグ用）
	console.log('THREEx available:', window.THREEx);

	// ARToolkitSource (カメラ映像の取得)
	const arToolkitSource = new window.THREEx.ArToolkitSource({
		sourceType: 'webcam',
	});

	// カメラ映像（video要素）を画面いっぱいに表示するためのリサイズ。
	//
	// 以前はここで renderer.domElement（R3Fのcanvas）にも同じサイズをコピーしていたが、
	// R3Fは親コンテナのResizeObserverでcanvasのサイズ・カメラのaspectを自律的に管理して
	// おり、外部からcanvasのインラインCSS（width/height/margin）を直接上書きするとR3F側の
	// 認識とズレてしまう。Androidの表示ズーム設定は window.innerWidth/innerHeight を変化
	// させ、かつ変化直後はレイアウトが非同期に安定するため、このズレが拡大し花火が画面端に
	// 押し出されて見えなくなる不具合の原因になっていた。video要素自身のサイズ調整だけを行い、
	// R3Fのcanvasには一切触れないようにする。
	const resizeVideoElement = () => {
		arToolkitSource.onResizeElement();
	};

	arToolkitSource.init(() => {
		// 遅延させないと初期リサイズがうまくいかないことがある
		// （video要素の videoWidth/videoHeight がストリーム開始直後は未確定なため）
		setTimeout(resizeVideoElement, 500);
	});

	// 画面回転・Androidの表示ズーム設定変更・ブラウザのツールバー表示/非表示等で
	// window.innerWidth/innerHeight が変わった際に、video要素のサイズを追従させ続ける
	// （以前はマウント時に1度リサイズするだけで、以後ズレたままになっていた）
	window.addEventListener('resize', resizeVideoElement);

	// ARToolkitContext (camera_para.dat の読み込みに使う)。
	// マーカー検出は行わないため、カメラの投影行列はR3Fが実ビューポートのaspectから
	// 自動計算するものにそのまま任せる。以前はここで camera.projectionMatrix を
	// 640×480前提の固定行列で上書きしており、R3Fの投影行列と競合していた
	const arToolkitContext = new window.THREEx.ArToolkitContext({
		cameraParametersUrl: 'https://raw.githubusercontent.com/AR-js-org/AR.js/master/data/data/camera_para.dat',
		detectionMode: 'mono',
	});

	arToolkitContext.init();

	// マーカー検出を使わず、単純に画面上に固定表示するためのルートオブジェクト
	const markerRoot = new THREE.Group();
	scene.add(markerRoot);
	
	// カメラの前方3メートルに配置
	markerRoot.position.set(0, 0, -30);
	
	// マーカー検出は使わないため、マーカーコントロールは作成しない
	// 代わりにダミーのイベントを発火させるための実装
	const dummyEventTarget = new EventTarget();
	(markerRoot as any).addEventListener = (eventName: string, callback: () => void) => {
		dummyEventTarget.addEventListener(eventName, callback as EventListener);
	};
	
	// ARカメラ映像のテクスチャ化
	const videoElement = arToolkitSource.domElement as HTMLVideoElement;
	const videoTexture = new THREE.VideoTexture(videoElement);
	videoTexture.minFilter = THREE.LinearFilter;
	videoTexture.magFilter = THREE.LinearFilter;
	videoTexture.format = THREE.RGBAFormat; // または RGBFormat
	
	const dispose = () => {
		window.removeEventListener('resize', resizeVideoElement);
	};

	return { arToolkitSource, arToolkitContext, markerRoot, videoElement, videoTexture, dispose };
}