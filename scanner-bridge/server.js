#!/usr/bin/env node
'use strict';

/**
 * スキャナーブリッジ：USB接続のスキャナを管理画面から使うためのローカルHTTPサーバー。
 *
 * ブラウザからスキャナを直接叩くAPIは存在しないため、ホスト上でこのサーバーを動かし、
 * admin（http://localhost:3000）から fetch して画像を受け取る。スキャン自体は
 * WIA経由（wia-scan.ps1）で行うため、USB接続のままで動く。
 *
 * プリンターがネットワーク接続の場合は、このブリッジを起動しなくても
 * APIサーバー側のeSCL実装（api/infra/escl.go の POST /scan）が使える。
 * admin側はどちらの経路も選べる（admin/utils/scanner.ts）。
 *
 * 依存パッケージなし。`node scanner-bridge/server.js` で起動する。
 */

const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { discover } = require('./mdns');
const { identityKeys } = require('./identity');
const { EsclClient } = require('./escl');

const PORT = Number(process.env.SCANNER_BRIDGE_PORT || 8090);
const HOST = process.env.SCANNER_BRIDGE_HOST || '127.0.0.1';
const POWERSHELL = process.env.SCANNER_BRIDGE_POWERSHELL || 'powershell.exe';
const SCAN_TIMEOUT_MS = Number(process.env.SCANNER_BRIDGE_TIMEOUT_MS || 300000);
const SCRIPT_PATH = path.join(__dirname, 'wia-scan.ps1');

// admin以外のサイトからローカルのスキャナを叩けてしまわないよう、許可したOriginだけを受け付ける。
// 既定には開発用のlocalhostと、本番・ステージングの管理画面ドメインを含める
// （本番のadminはCloudflare Tunnel経由の https://hanabi-admin.nutfes.net から
// このPCの http://localhost:8090 を叩く）。
const ALLOWED_ORIGINS = (
  process.env.SCANNER_BRIDGE_ALLOW_ORIGIN ||
  [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://hanabi-admin.nutfes.net',
    'https://hanabi-admin-stg.nutfes.net',
  ].join(',')
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const DEFAULT_DPI = 300;
const MIN_DPI = 75;
const MAX_DPI = 1200;

// スキャナがJPEGを返さない場合にwia-scan.ps1側で変換する際の品質
const DEFAULT_QUALITY = 85;

function applyCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  // 公開サイト（https://hanabi-admin.nutfes.net）からローカルアドレスへのfetchは、
  // Chromeの Private Network Access で追加のプリフライトが要求される。その応答
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

/**
 * Originが付いているのに許可リストに無ければ拒否する。
 * CORSヘッダーを返さないだけだと、ブラウザは応答を読めなくとも
 * リクエスト自体は送ってしまうため、悪意あるページから
 * <form> や <img> でスキャンを起動させられる。curl等（Origin無し）は通す。
 */
function isOriginAllowed(req) {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.includes(origin);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/**
 * PowerShellはエラーメッセージの後に "At <path>:<line> char:.." 以降のスタックを
 * 続けて出すため、操作者に見せるのは最初の1行だけにする（全文はログへ残す）。
 */
function firstErrorLine(stderr) {
  const lines = stderr
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.startsWith('WARNING:')) continue;
    if (line.startsWith('At ') || line.startsWith('+') || line.startsWith('CategoryInfo')) continue;
    return line;
  }
  return '';
}

/**
 * wia-scan.ps1 の出力からJSONを取り出す。
 *
 * PowerShellは呼び出し方によって警告（"WARNING: ..."）をstdout側へ書くことがあり、
 * stdout全体をそのままJSONとして解釈すると、スキャンが成功していても失敗扱いに
 * なってしまう。JSONの開始位置を探し、それでも駄目なら末尾の行から順に試す。
 */
function parseScriptOutput(stdout) {
  const text = stdout.trim();
  if (!text) {
    throw new Error('wia-scan.ps1 が何も出力しませんでした');
  }

  const start = text.search(/[[{]/);
  if (start >= 0) {
    try {
      return JSON.parse(text.slice(start));
    } catch {
      // 前後に別の出力が混ざっている場合は行単位で探す
    }
  }

  const lines = text.split(/\r?\n/).reverse();
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        // 次の行を試す
      }
    }
  }

  throw new Error('wia-scan.ps1 の出力にJSONが見つかりませんでした: ' + text.slice(0, 300));
}

/**
 * wia-scan.ps1 を実行し、stdoutに出力されたJSONを返す。
 * WIAのCOMオブジェクトはSTAスレッドでないと生成できない環境があるため -Sta を明示する。
 */
function runScanScript(args) {
  return new Promise((resolve, reject) => {
    const psArgs = [
      '-NoProfile',
      '-NonInteractive',
      '-Sta',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      SCRIPT_PATH,
    ].concat(args);

    const child = spawn(POWERSHELL, psArgs, { windowsHide: true });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, SCAN_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error('PowerShellを起動できませんでした (' + POWERSHELL + '): ' + error.message));
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      if (timedOut) {
        reject(new Error('スキャンがタイムアウトしました (' + SCAN_TIMEOUT_MS + 'ms)'));
        return;
      }
      if (code !== 0) {
        if (stderr.trim()) {
          console.error('[scanner-bridge] wia-scan.ps1 stderr:', stderr.trim());
        }
        reject(
          new Error(firstErrorLine(stderr) || 'wia-scan.ps1 が異常終了しました (exit ' + code + ')')
        );
        return;
      }

      // ドライバーが一部のプロパティを受け付けない場合、警告はstderrに出るが
      // スキャン自体は成功しているため、ログに残して先へ進む
      if (stderr.trim()) {
        console.warn('[scanner-bridge] wia-scan.ps1 warning:', stderr.trim());
      }

      try {
        resolve(parseScriptOutput(stdout));
      } catch (parseError) {
        reject(new Error('wia-scan.ps1 の出力を解釈できませんでした: ' + parseError.message));
      }
    });
  });
}

async function listDevices() {
  const devices = await runScanScript(['-List']);
  return Array.isArray(devices) ? devices : [devices];
}

/**
 * 同じ登録を優先したい順に並べる比較関数。
 * 接続中 > スキャナとして申告(Type=1) > メーカー純正ドライバー の順。
 */
function compareDeviceRank(left, right) {
  if (Boolean(left.present) !== Boolean(right.present)) {
    return left.present ? -1 : 1;
  }
  const score = (device) =>
    (device.type === 1 ? 0 : 2) + (device.driverKind === 'vendor' ? 0 : 1);
  return score(left) - score(right);
}

/** WIAの登録1件から、同一機判定用の手がかりを作る */
function deviceIdentityKeys(device) {
  return identityKeys({
    name: device.name,
    ids: [device.deviceId || '', device.port || ''],
  });
}

/**
 * 1台のプリンターが複数の登録として現れ、2台以上に見えてしまう問題をまとめる。
 *
 * 手がかり（名前・UUID・MAC）を1つでも共有する登録は同一機とみなして統合し、
 * 代表1件だけを devices として返す。統合した他の登録は alternates に入れる。
 * Windowsは切断後も登録を保持するため、実在しないものは present=false で示す。
 */
function groupDevices(devices) {
  const groups = [];
  const keyToGroup = new Map();

  for (const device of devices) {
    const keys = deviceIdentityKeys(device);

    // すでに同じ手がかりを持つグループがあれば、それらをまとめて1つにする
    const matched = [];
    for (const key of keys) {
      const index = keyToGroup.get(key);
      if (index !== undefined && !matched.includes(index)) matched.push(index);
    }

    if (matched.length === 0) {
      const index = groups.length;
      groups.push({ entries: [device], keys: new Set(keys) });
      for (const key of keys) keyToGroup.set(key, index);
      continue;
    }

    const target = groups[matched[0]];
    target.entries.push(device);
    for (const key of keys) {
      target.keys.add(key);
      keyToGroup.set(key, matched[0]);
    }

    // 複数のグループを橋渡しした場合は、それらも1つに畳む
    for (const index of matched.slice(1)) {
      const merged = groups[index];
      if (!merged) continue;
      target.entries.push(...merged.entries);
      for (const key of merged.keys) {
        target.keys.add(key);
        keyToGroup.set(key, matched[0]);
      }
      groups[index] = null;
    }
  }

  const grouped = [];
  for (const group of groups) {
    if (!group) continue;
    const sorted = group.entries.slice().sort(compareDeviceRank);
    const primary = sorted[0];
    grouped.push({
      deviceId: primary.deviceId,
      name: primary.name,
      port: primary.port,
      manufacturer: primary.manufacturer,
      type: primary.type,
      driverKind: primary.driverKind,
      connection: primary.connection || 'unknown',
      present: Boolean(primary.present),
      // eSCLで直接見えている同じプリンターと突き合わせるための手がかり。
      // グループ内の全登録分を合わせて渡す
      identityKeys: Array.from(new Set(group.entries.flatMap(deviceIdentityKeys))),
      // 同じプリンターの別登録（画面には出さないが診断に使える）
      alternates: sorted.slice(1).map((entry) => ({
        deviceId: entry.deviceId,
        port: entry.port,
        driverKind: entry.driverKind,
        connection: entry.connection || 'unknown',
        manufacturer: entry.manufacturer,
        present: Boolean(entry.present),
      })),
    });
  }

  grouped.sort(compareDeviceRank);
  return grouped;
}

async function scan(options) {
  const outputPath = path.join(os.tmpdir(), 'scanner-bridge-' + crypto.randomUUID() + '.jpg');
  const args = ['-Out', outputPath, '-Dpi', String(options.dpi), '-Quality', String(options.quality)];
  if (options.deviceId) {
    args.push('-DeviceId', options.deviceId);
  }

  try {
    const meta = await runScanScript(args);
    const data = await fs.readFile(outputPath);
    return { data: data, meta: meta };
  } finally {
    // 読み込み後の一時ファイルは残さない（失敗時も同様）
    await fs.rm(outputPath, { force: true }).catch(() => {});
  }
}

function parseDpi(rawValue) {
  const dpi = Number(rawValue);
  if (!Number.isFinite(dpi)) return DEFAULT_DPI;
  return Math.min(MAX_DPI, Math.max(MIN_DPI, Math.round(dpi)));
}

function parseQuality(rawValue) {
  const quality = Number(rawValue);
  if (!Number.isFinite(quality)) return DEFAULT_QUALITY;
  return Math.min(100, Math.max(1, Math.round(quality)));
}

const server = http.createServer(async (req, res) => {
  applyCorsHeaders(req, res);

  if (!isOriginAllowed(req)) {
    console.warn('[scanner-bridge] 許可されていないOriginからの要求を拒否:', req.headers.origin);
    sendJson(res, 403, { ok: false, error: '許可されていないOriginです: ' + req.headers.origin });
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const route = requestUrl.pathname.replace(/\/+$/, '') || '/';
  const esclTarget = (requestUrl.searchParams.get('target') || '').trim();

  // Windows以外ではWIA（USB経路）が使えない。ただし /health・/discover・/escl/status と
  // eSCLでのスキャン（target指定あり）はNodeだけで動くのでどのOSでも使える
  const platformIndependentRoutes = ['/health', '/discover', '/escl/status'];
  const isEsclScan = route === '/scan' && esclTarget !== '';
  if (process.platform !== 'win32' && !platformIndependentRoutes.includes(route) && !isEsclScan) {
    sendJson(res, 501, {
      ok: false,
      error:
        'このブリッジはWIAを使うためWindows専用です。macOS/Linuxではプリンターをネットワークに接続し、APIサーバー側のeSCL経路（POST /scan）を使ってください。',
    });
    return;
  }

  try {
    if (route === '/health' && req.method === 'GET') {
      let deviceCount = null;
      let registeredCount = null;
      let deviceError = null;
      if (process.platform === 'win32') {
        try {
          const grouped = groupDevices(await listDevices());
          // 実際に接続されている台数だけを数える（Windowsには過去の
          // 接続設定が残るため、登録数とは一致しない）
          deviceCount = grouped.filter((device) => device.present).length;
          registeredCount = grouped.length;
        } catch (error) {
          deviceError = error.message;
        }
      }
      sendJson(res, 200, {
        ok: deviceError === null,
        platform: process.platform,
        source: 'wia',
        deviceCount: deviceCount,
        registeredCount: registeredCount,
        error: deviceError,
      });
      return;
    }

    if (route === '/devices' && req.method === 'GET') {
      const raw = await listDevices();
      const grouped = groupDevices(raw);
      const connected = grouped.filter((device) => device.present);
      sendJson(res, 200, {
        ok: true,
        devices: grouped,
        // 画面で「未接続の登録が混ざっている」ことを説明できるようにする
        connectedCount: connected.length,
        registeredCount: grouped.length,
        rawCount: raw.length,
      });
      return;
    }

    // LAN上のスキャナをmDNSで検出する。APIサーバー（コンテナ）へは
    // マルチキャストが届かないため、この検出はホスト側で行う必要がある
    if (route === '/discover' && req.method === 'GET') {
      const timeoutMs = Math.min(15000, Math.max(1000, Number(requestUrl.searchParams.get('timeoutMs')) || 4000));
      console.log('[scanner-bridge] discover start (timeoutMs=' + timeoutMs + ')');
      const devices = await discover({ timeoutMs: timeoutMs });
      console.log(
        '[scanner-bridge] discover done: ' +
          devices.length +
          '台 (' +
          devices.map((d) => (d.model || d.name) + (d.scanSupported ? '/eSCL' : '/スキャン不可')).join(', ') +
          ')'
      );
      sendJson(res, 200, { ok: true, devices: devices });
      return;
    }

    // LAN上のeSCLスキャナの対応状況（機種名・対応解像度）。管理画面の候補表示と接続確認に使う
    if (route === '/escl/status' && req.method === 'GET') {
      if (!esclTarget) {
        sendJson(res, 400, { ok: false, error: 'target（スキャナの接続先）を指定してください' });
        return;
      }
      try {
        const client = new EsclClient(esclTarget);
        const caps = await client.capabilities();
        sendJson(res, 200, {
          ok: true,
          target: client.target,
          makeAndModel: caps.makeAndModel,
          version: caps.version,
          resolutions: caps.resolutions,
          colorModes: caps.colorModes,
          formats: caps.documentFormatsExt.length > 0 ? caps.documentFormatsExt : caps.documentFormats,
          maxWidthMm: Math.round((caps.maxWidth / 300) * 25.4),
          maxHeightMm: Math.round((caps.maxHeight / 300) * 25.4),
        });
      } catch (error) {
        sendJson(res, 200, { ok: false, target: esclTarget, error: error.message });
      }
      return;
    }

    // スキャンは状態を変える操作なのでPOSTだけ受け付ける（リンクや<img>で起動されないように）
    if (route === '/scan' && req.method === 'POST') {
      const dpi = parseDpi(requestUrl.searchParams.get('dpi'));

      // target があればLAN上のプリンターへeSCLで直接読み取りを要求する。
      // 本番ではAPIサーバーがクラウド側にいて会場のLANへ届かないため、
      // eSCLの読み取りもプリンターと同じLANにいるこのブリッジが行う
      if (esclTarget) {
        console.log('[scanner-bridge] escl scan start (target=' + esclTarget + ', dpi=' + dpi + ')');
        const client = new EsclClient(esclTarget);
        const result = await client.scan({ dpi: dpi, colorMode: requestUrl.searchParams.get('colorMode') || '' });
        console.log(
          '[scanner-bridge] escl scan done (' + result.data.length + ' bytes, ' + result.dpi + 'dpi, ' + (result.makeAndModel || client.target) + ')'
        );

        res.writeHead(200, {
          'Content-Type': result.contentType,
          'Content-Length': result.data.length,
          'Cache-Control': 'no-store',
          'X-Scan-Dpi': String(result.dpi),
          'X-Scan-Color-Mode': result.colorMode,
          'X-Scan-Target': client.target,
          'X-Scan-Model': encodeURIComponent(result.makeAndModel || ''),
          'Access-Control-Expose-Headers': 'X-Scan-Dpi, X-Scan-Color-Mode, X-Scan-Target, X-Scan-Model',
        });
        res.end(result.data);
        return;
      }

      const quality = parseQuality(requestUrl.searchParams.get('quality'));
      const deviceId = requestUrl.searchParams.get('deviceId') || '';

      console.log('[scanner-bridge] scan start (dpi=' + dpi + ', deviceId=' + (deviceId || 'auto') + ')');
      const result = await scan({ dpi: dpi, quality: quality, deviceId: deviceId });
      console.log(
        '[scanner-bridge] scan done (' +
          result.data.length +
          ' bytes, ' +
          result.meta.width +
          'x' +
          result.meta.height +
          (result.meta.convertedToJpeg ? ', converted to JPEG' : '') +
          ')'
      );

      res.writeHead(200, {
        'Content-Type': result.meta.format || 'image/jpeg',
        'Content-Length': result.data.length,
        'Cache-Control': 'no-store',
        'X-Scan-Width': String(result.meta.width || ''),
        'X-Scan-Height': String(result.meta.height || ''),
        'X-Scan-Dpi': String(result.meta.dpi || dpi),
        'X-Scan-Model': encodeURIComponent(result.meta.device || ''),
        // ブラウザのJSからこれらのヘッダーを読めるようにする
        'Access-Control-Expose-Headers': 'X-Scan-Width, X-Scan-Height, X-Scan-Dpi, X-Scan-Model',
      });
      res.end(result.data);
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found: ' + req.method + ' ' + route });
  } catch (error) {
    console.error('[scanner-bridge] error:', error.message);
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

// 300dpiのスキャンは数十秒かかるため、Nodeの既定タイムアウトでは足りない
server.requestTimeout = SCAN_TIMEOUT_MS + 60000;
server.headersTimeout = SCAN_TIMEOUT_MS + 60000;

server.listen(PORT, HOST, () => {
  console.log('[scanner-bridge] listening on http://' + HOST + ':' + PORT);
  console.log('[scanner-bridge] allowed origins: ' + ALLOWED_ORIGINS.join(', '));
  console.log(
    '[scanner-bridge] endpoints: GET /health, GET /devices, GET /discover, GET /escl/status?target=, POST /scan?dpi=300[&deviceId=|&target=]'
  );
});
