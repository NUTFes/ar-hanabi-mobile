/**
 * スキャナから画像を取り込むためのクライアント。
 *
 * ブラウザからスキャナを直接操作するAPIは無いため、実際の読み取りには2つの経路がある。
 *
 * - 'escl'   … APIサーバーからeSCL（AirPrint Scan）でプリンターを直接叩く
 *              （api/infra/escl.go）。プリンターがLAN上にある場合に使える。
 * - 'bridge' … ホスト上のローカルブリッジ（scanner-bridge、WIA経由）に読み取らせる
 *              （USB接続のプリンターや、Windowsが登録済みのネットワークスキャナ）。
 *
 * ただし操作者にとっては「どのプリンターで読むか」だけが関心事で、経路は実装の詳細。
 * そのため loadScanners() で両経路の候補を集めて**同じプリンターは1件に統合**し、
 * 画面には使えるプリンターの一覧だけを出す。経路は使える方を自動で選び、
 * 失敗したらもう一方の経路へ自動でフォールバックする。
 *
 * どちらの経路も「画像を返すだけ」で、花火としての登録は既存の POST /fireworks に任せる。
 */

const BRIDGE_URL = (process.env.NEXT_PUBLIC_SCANNER_BRIDGE_URL || 'http://localhost:8090').replace(/\/+$/, '');
const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');

export const DEFAULT_SCAN_DPI = 300;
export const FALLBACK_DPI_OPTIONS = [150, 300, 600];

/** 読み取りに使う経路。画面には出さず、内部の選択にだけ使う */
export type ScanRoute = 'escl' | 'bridge';

export const SCAN_ROUTE_LABELS: Record<ScanRoute, string> = {
  escl: 'ネットワーク直接（eSCL）',
  bridge: 'このPC経由（ブリッジ）',
};

export interface ScanRouteInfo {
  route: ScanRoute;
  /** escl なら接続先URL、bridge なら WIAのデバイスID */
  ref: string;
  /**
   * escl のとき、実際にプリンターへHTTPを投げる場所。
   * 本番ではAPIサーバーがクラウド側にいて会場のLANに届かないため、
   * ブリッジが動いていれば必ずブリッジ（会場のPC）から投げる。
   */
  via?: 'bridge' | 'api';
  /** その経路での接続方法（分かる場合） */
  connection: 'usb' | 'network' | 'unknown';
  /** 今使えるか */
  usable: boolean;
  /** 使えない場合の理由 */
  reason?: string;
}

/** 画面のプルダウンに並べるプリンター1台 */
export interface ScannerOption {
  /** 選択の保存に使う安定したID */
  id: string;
  /** プルダウンに出すラベル */
  label: string;
  model: string;
  /** 使える経路（優先順） */
  routes: ScanRouteInfo[];
  /** 本体が対応している解像度（分かる場合） */
  resolutions?: number[];
  /** 1つでも使える経路があるか */
  usable: boolean;
  /** 使えない理由（usable が false のとき） */
  reason?: string;
}

export interface ScannerList {
  scanners: ScannerOption[];
  /** 収集中に起きた問題（画面に注意として出す） */
  warnings: string[];
  /** ローカルブリッジに到達できたか。false なら起動手順を画面に出す */
  bridgeAvailable: boolean;
}

/**
 * ブリッジを起動するためのワンライナー。管理画面のオリジンを埋め込むことで、
 * どのドメインにデプロイしても（nutfes以外でも）そのオリジンが許可される。
 */
export function bridgeStartCommands(origin: string): { windows: string; mac: string } {
  const trimmed = origin.replace(/\/+$/, '');
  return {
    windows: `$env:HANABI_ADMIN_ORIGIN='${trimmed}'; irm ${trimmed}/bridge/start.ps1 | iex`,
    mac: `HANABI_ADMIN_ORIGIN=${trimmed} curl -fsSL ${trimmed}/bridge/start.sh | bash`,
  };
}

export interface ScanRequest {
  dpi?: number;
  signal?: AbortSignal;
}

export interface ScanOutcome {
  /** そのまま既存の画像アップロード経路へ流せる File */
  file: File;
  /**
   * 実際に読み取られた解像度。要求値が本体の対応外だと自動で近い値へ寄せられるため、
   * 何dpiになったかを画面に出せるようにレスポンスヘッダーから拾う。
   */
  dpi?: number;
  /** 実際に読み取った機種名 */
  model?: string;
  /** 実際に使われた経路 */
  route: ScanRoute;
}

// ---------------------------------------------------------------------------
// 共通ヘルパー
// ---------------------------------------------------------------------------

// ブリッジもAPIもエラー時は {"error": "..."} を返すが、
// プロキシ等が挟まると素のテキストが返ることもあるため両方に備える。
async function extractErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return fallback;

    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.error === 'string' && parsed.error) return parsed.error;
      if (typeof parsed?.reason === 'string' && parsed.reason) return parsed.reason;
    } catch {
      // JSONでなければ本文をそのまま使う
    }
    return text.slice(0, 300);
  } catch {
    return fallback;
  }
}

function scanFileName(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `scan-${stamp}.jpg`;
}

function normalizeTarget(target: string): string {
  return target.replace(/\/+$/, '');
}

// ---------------------------------------------------------------------------
// 候補の収集
// ---------------------------------------------------------------------------

interface Candidate {
  identityKeys: string[];
  model: string;
  /** 表示の補足（IPアドレスや接続方法） */
  location: string;
  route: ScanRouteInfo;
  resolutions?: number[];
}

interface BridgeDeviceResponse {
  deviceId?: string;
  name?: string;
  connection?: string;
  present?: boolean;
  identityKeys?: string[];
}

interface DiscoveredDevice {
  name?: string;
  model?: string;
  address?: string | null;
  host?: string | null;
  services?: string[];
  scanSupported?: boolean;
  identityKeys?: string[];
  escl?: { url?: string } | null;
}

interface ApiScannerInfo {
  target?: string;
  available?: boolean;
  makeAndModel?: string;
  resolutions?: number[];
  reason?: string;
}

/** 名前だけしか分からない候補のための、最低限の手がかり */
function fallbackIdentityKeys(name: string, extra: string): string[] {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const keys: string[] = [];
  if (normalized) keys.push('name:' + normalized);

  const model = name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(
      (token) =>
        token.length >= 3 &&
        token.length <= 12 &&
        /[a-z]/.test(token) &&
        /[0-9]/.test(token) &&
        !(token.length >= 8 && /^[0-9a-f]+$/.test(token))
    )
    .reduce((longest, token) => (token.length > longest.length ? token : longest), '');
  if (model) keys.push('model:' + model);

  if (extra) keys.push('addr:' + extra.toLowerCase());
  return keys;
}

interface BridgeCollection {
  candidates: Candidate[];
  warnings: string[];
  /** ブリッジに到達できたか。eSCLをブリッジ経由にするかの判断に使う */
  available: boolean;
}

async function collectBridgeCandidates(signal?: AbortSignal): Promise<BridgeCollection> {
  const candidates: Candidate[] = [];
  const warnings: string[] = [];

  try {
    const response = await fetch(`${BRIDGE_URL}/devices`, { signal });
    if (!response.ok) {
      return {
        candidates,
        available: true,
        warnings: [await extractErrorMessage(response, `スキャナ一覧の取得に失敗しました (HTTP ${response.status})`)],
      };
    }

    const body = await response.json();
    const devices: BridgeDeviceResponse[] = Array.isArray(body?.devices) ? body.devices : [];

    for (const device of devices) {
      if (!device.deviceId) continue;

      const name = device.name || 'スキャナ';
      const present = device.present !== false;
      const connection =
        device.connection === 'usb' || device.connection === 'network' ? device.connection : 'unknown';

      candidates.push({
        identityKeys:
          device.identityKeys && device.identityKeys.length > 0
            ? device.identityKeys
            : fallbackIdentityKeys(name, device.deviceId),
        model: name,
        location: connection === 'usb' ? 'USB' : connection === 'network' ? 'ネットワーク' : '',
        route: {
          route: 'bridge',
          ref: device.deviceId,
          connection,
          usable: present,
          reason: present
            ? undefined
            : 'このPCに接続されていません（Windowsには過去に接続したプリンターの設定が残ります）',
        },
      });
    }
  } catch {
    return {
      candidates,
      available: false,
      warnings: [
        `ローカルブリッジ（${BRIDGE_URL}）に接続できません。このPCに繋いだスキャナも、LAN上のスキャナの読み取りも` +
          'ブリッジが担当するため、scanner-bridge を起動してください。',
      ],
    };
  }

  return { candidates, warnings, available: true };
}

interface BridgeEsclStatus {
  ok?: boolean;
  makeAndModel?: string;
  resolutions?: number[];
  error?: string;
}

/** ブリッジ経由でLAN上のeSCLスキャナの対応状況を取る（機種名・対応解像度・到達確認） */
async function fetchEsclStatusViaBridge(target: string, signal?: AbortSignal): Promise<BridgeEsclStatus | null> {
  try {
    const response = await fetch(`${BRIDGE_URL}/escl/status?target=${encodeURIComponent(target)}`, { signal });
    if (!response.ok) return null;
    return (await response.json()) as BridgeEsclStatus;
  } catch {
    return null;
  }
}

async function collectEsclCandidates(
  bridgeAvailable: boolean,
  signal?: AbortSignal
): Promise<{ candidates: Candidate[]; warnings: string[] }> {
  const candidates: Candidate[] = [];
  const warnings: string[] = [];
  const seenTargets = new Set<string>();
  // ブリッジがいればプリンターと同じLANから叩ける。いなければAPI経由
  // （開発時に全部が同一LANにある場合だけ成立する）
  const via: 'bridge' | 'api' = bridgeAvailable ? 'bridge' : 'api';

  // 1) mDNSでの自動検出（ホスト側ブリッジが担当）
  try {
    const response = await fetch(`${BRIDGE_URL}/discover`, { signal });
    if (response.ok) {
      const body = await response.json();
      const devices: DiscoveredDevice[] = Array.isArray(body?.devices) ? body.devices : [];

      for (const device of devices) {
        const model = device.model || device.name || 'スキャナ';
        const address = device.address ?? device.host ?? '';
        const target = device.escl?.url ? normalizeTarget(device.escl.url) : '';

        if (!target) {
          warnings.push(
            `${model} はeSCLに対応していないため使えません` +
              `（検出したサービス: ${(device.services || []).join(', ') || 'なし'}）`
          );
          continue;
        }

        seenTargets.add(target);
        candidates.push({
          identityKeys:
            device.identityKeys && device.identityKeys.length > 0
              ? device.identityKeys
              : fallbackIdentityKeys(model, address),
          model,
          location: address,
          route: { route: 'escl', ref: target, connection: 'network', usable: true, via },
        });
      }
    }
  } catch {
    // ブリッジ未起動。自動検出は諦め、API設定分だけで続ける
  }

  // ブリッジ経由なら、検出した各機器の対応解像度と到達性をその場で確かめる
  // （対応外の解像度を要求すると、受理されてもスキャンされない機種があるため）
  if (bridgeAvailable) {
    await Promise.all(
      candidates.map(async (candidate) => {
        const status = await fetchEsclStatusViaBridge(candidate.route.ref, signal);
        if (!status) return;
        if (status.ok) {
          candidate.resolutions = status.resolutions;
          if (status.makeAndModel) candidate.model = status.makeAndModel;
        } else {
          candidate.route.usable = false;
          candidate.route.reason = status.error;
        }
      })
    );
  }

  // 2) APIに設定済みの機器（到達確認と対応解像度が付く）
  try {
    const response = await fetch(`${API_URL}/scanners`, { signal });
    if (response.ok) {
      const body = await response.json();
      const scanners: ApiScannerInfo[] = Array.isArray(body?.scanners) ? body.scanners : [];

      for (const scanner of scanners) {
        if (!scanner.target) continue;
        const target = normalizeTarget(scanner.target);
        const host = target.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        const model = scanner.makeAndModel || host;

        const existing = candidates.find((candidate) => candidate.route.ref === target);
        if (existing) {
          // 検出済みの機器に、APIが確認した情報を足す（ブリッジ経由で確認済みなら上書きしない）
          if (!bridgeAvailable) {
            existing.resolutions = scanner.resolutions;
            existing.route.usable = scanner.available !== false;
            existing.route.reason = scanner.reason;
          }
          if (scanner.makeAndModel && !existing.model) existing.model = scanner.makeAndModel;
          continue;
        }

        seenTargets.add(target);
        // 設定済みの接続先も、ブリッジがいればブリッジから叩く。
        // APIから見た到達性（クラウドからは届かない）ではなく、ブリッジから確かめる
        const candidate: Candidate = {
          identityKeys: fallbackIdentityKeys(model, host),
          model,
          location: host,
          resolutions: scanner.resolutions,
          route: {
            route: 'escl',
            ref: target,
            connection: 'network',
            usable: bridgeAvailable ? true : scanner.available !== false,
            reason: bridgeAvailable ? undefined : scanner.reason,
            via,
          },
        };
        if (bridgeAvailable) {
          const status = await fetchEsclStatusViaBridge(target, signal);
          if (status?.ok) {
            candidate.resolutions = status.resolutions;
            if (status.makeAndModel) candidate.model = status.makeAndModel;
          } else if (status) {
            candidate.route.usable = false;
            candidate.route.reason = status.error;
          }
        }
        candidates.push(candidate);
      }
    }
  } catch {
    warnings.push(`APIサーバー（${API_URL}）に接続できません。`);
  }

  return { candidates, warnings };
}

/**
 * 表示用に機種名を整える。
 * WIAの登録名には "TS8330 series _F96B4C000000" のように機器IDが付くことがあるため、
 * 末尾の16進の塊を落とす。
 */
function cleanModelName(name: string): string {
  return name
    .replace(/[_\s]+[0-9A-Fa-f]{6,}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 手がかりを1つでも共有する候補を同一のプリンターとしてまとめる。
 * 同じ1台がUSB・ネットワーク・eSCLで別々に見つかっても1件になる。
 */
function mergeCandidates(candidates: Candidate[]): ScannerOption[] {
  const groups: { keys: Set<string>; items: Candidate[] }[] = [];

  for (const candidate of candidates) {
    const matched = groups.filter((group) => candidate.identityKeys.some((key) => group.keys.has(key)));

    if (matched.length === 0) {
      groups.push({ keys: new Set(candidate.identityKeys), items: [candidate] });
      continue;
    }

    const target = matched[0];
    target.items.push(candidate);
    for (const key of candidate.identityKeys) target.keys.add(key);

    // 複数のグループを橋渡ししたら、それらも1つに畳む
    for (const group of matched.slice(1)) {
      target.items.push(...group.items);
      for (const key of group.keys) target.keys.add(key);
      groups.splice(groups.indexOf(group), 1);
    }
  }

  return groups.map((group) => {
    // 経路の優先順: eSCL直接 > ブリッジ。使えないものは後ろへ
    const sortedItems = group.items.slice().sort((left, right) => {
      if (left.route.usable !== right.route.usable) return left.route.usable ? -1 : 1;
      if (left.route.route !== right.route.route) return left.route.route === 'escl' ? -1 : 1;
      return 0;
    });
    const routes = sortedItems.map((item) => item.route);

    // 機種名は優先する経路のものを使う。WIAの登録名は
    // "TS8330 series _F96B4C000000" のように機器IDが付くことがあり、
    // 本体が広告する名前（eSCL側）のほうが読みやすい
    const model = cleanModelName(sortedItems.find((item) => item.model)?.model || '') || 'スキャナ';

    const location = group.items.map((item) => item.location).find(Boolean) || '';
    const resolutions = group.items.find((item) => item.resolutions?.length)?.resolutions;
    const usableRoute = routes.find((route) => route.usable);

    return {
      id: routes[0].route + ':' + routes[0].ref,
      label: location ? `${model}（${location}）` : model,
      model,
      routes,
      resolutions,
      usable: Boolean(usableRoute),
      reason: usableRoute ? undefined : routes[0].reason,
    };
  });
}

/**
 * 使えるプリンターの一覧を集める。経路の違いは内部に隠し、
 * 同じプリンターは1件にまとめて返す。
 */
export async function loadScanners(signal?: AbortSignal): Promise<ScannerList> {
  // ブリッジの有無でeSCLの叩き先が変わるため、先にブリッジを確認する
  const bridge = await collectBridgeCandidates(signal);
  const escl = await collectEsclCandidates(bridge.available, signal);

  const scanners = mergeCandidates([...escl.candidates, ...bridge.candidates]);

  // 使えるものを先に、その中では名前順で並べる
  scanners.sort((left, right) => {
    if (left.usable !== right.usable) return left.usable ? -1 : 1;
    return left.label.localeCompare(right.label);
  });

  return { scanners, warnings: [...escl.warnings, ...bridge.warnings], bridgeAvailable: bridge.available };
}

// ---------------------------------------------------------------------------
// スキャン実行
// ---------------------------------------------------------------------------

function scanUrl(route: ScanRouteInfo, dpi: number): string {
  const params = new URLSearchParams({ dpi: String(dpi) });

  if (route.route === 'bridge') {
    params.set('deviceId', route.ref);
    return `${BRIDGE_URL}/scan?${params.toString()}`;
  }

  params.set('target', route.ref);
  // eSCLはブリッジ（会場のPC）から叩くのが基本。APIはブリッジが無い開発時だけ
  if (route.via !== 'api') {
    return `${BRIDGE_URL}/scan?${params.toString()}`;
  }
  return `${API_URL}/scan?${params.toString()}`;
}

/** X-Scan-Model はASCII以外を含み得るためURLエンコードされて返る */
function decodeHeader(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function scanVia(route: ScanRouteInfo, dpi: number, signal?: AbortSignal): Promise<ScanOutcome> {
  // body を空文字で明示して Content-Length: 0 を必ず付ける。
  // PowerShell版ブリッジ（HTTP.sys）は Content-Length 無しの POST を 411 で弾く
  const response = await fetch(scanUrl(route, dpi), { method: 'POST', body: '', signal });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, `スキャンに失敗しました (HTTP ${response.status})`));
  }

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error('スキャン結果が空でした。もう一度お試しください。');
  }

  const dpiHeader = Number(response.headers.get('X-Scan-Dpi'));

  return {
    file: new File([blob], scanFileName(), { type: blob.type || 'image/jpeg' }),
    dpi: Number.isFinite(dpiHeader) && dpiHeader > 0 ? dpiHeader : undefined,
    model: decodeHeader(response.headers.get('X-Scan-Model')),
    route: route.route,
  };
}

/**
 * 選んだプリンターでスキャンする。
 * 使える経路から順に試し、失敗したらもう一方の経路へ自動でフォールバックする
 * （当日「どちらの経路か」を操作者に判断させないため）。
 */
export async function scanWithScanner(scanner: ScannerOption, request: ScanRequest = {}): Promise<ScanOutcome> {
  const dpi = request.dpi ?? DEFAULT_SCAN_DPI;
  const routes = scanner.routes.filter((route) => route.usable);

  if (routes.length === 0) {
    throw new Error(scanner.reason || 'このスキャナは今使えません。');
  }

  const failures: string[] = [];
  for (const route of routes) {
    try {
      return await scanVia(route, dpi, request.signal);
    } catch (error) {
      // 中止は操作者の意思なのでフォールバックしない
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      failures.push(`${SCAN_ROUTE_LABELS[route.route]}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(failures.join('\n'));
}

/** 選んだプリンターに今つながるかを確認する（接続確認ボタン用） */
export async function checkScanner(scanner: ScannerOption, signal?: AbortSignal): Promise<{ ok: boolean; detail: string }> {
  const route = scanner.routes.find((candidate) => candidate.usable);
  if (!route) {
    return { ok: false, detail: scanner.reason || 'このスキャナは今使えません。' };
  }

  if (route.route === 'bridge') {
    try {
      const response = await fetch(`${BRIDGE_URL}/health`, { signal });
      const body = await response.json();
      if (body?.ok !== true) {
        return { ok: false, detail: body?.error || 'ローカルブリッジがスキャナを認識していません。' };
      }
      return { ok: true, detail: `${SCAN_ROUTE_LABELS.bridge} / 接続中 ${body.deviceCount} 台` };
    } catch (error) {
      return { ok: false, detail: `ローカルブリッジに接続できません: ${error instanceof Error ? error.message : ''}` };
    }
  }

  // eSCL: ブリッジ経由（本番）か、API経由（開発）
  if (route.via !== 'api') {
    const status = await fetchEsclStatusViaBridge(route.ref, signal);
    if (!status) {
      return { ok: false, detail: `ローカルブリッジ（${BRIDGE_URL}）に接続できません。scanner-bridge を起動してください。` };
    }
    if (!status.ok) {
      return { ok: false, detail: status.error || 'eSCLでスキャナに接続できません。' };
    }
    const resolutions = status.resolutions || [];
    const detail = [SCAN_ROUTE_LABELS.escl, status.makeAndModel, resolutions.length ? `対応解像度 ${resolutions.join('/')}` : '']
      .filter(Boolean)
      .join(' / ');
    return { ok: true, detail };
  }

  try {
    const response = await fetch(`${API_URL}/scan/status?target=${encodeURIComponent(route.ref)}`, { signal });
    const body = await response.json();
    if (body?.available !== true) {
      return { ok: false, detail: body?.reason || 'eSCLでスキャナに接続できません。' };
    }
    const resolutions: number[] = Array.isArray(body?.resolutions) ? body.resolutions : [];
    const detail = [SCAN_ROUTE_LABELS.escl, body?.makeAndModel, resolutions.length ? `対応解像度 ${resolutions.join('/')}` : '']
      .filter(Boolean)
      .join(' / ');
    return { ok: true, detail };
  } catch (error) {
    return { ok: false, detail: `APIサーバーに接続できません: ${error instanceof Error ? error.message : ''}` };
  }
}
