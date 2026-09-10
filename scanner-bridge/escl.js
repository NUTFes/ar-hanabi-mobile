'use strict';

/**
 * eSCL（AirPrint Scan / AirScan）クライアント。ブリッジ（会場のPC）から
 * LAN上のプリンターへ直接HTTPで読み取りを要求する。
 *
 * なぜAPIサーバー側（api/infra/escl.go）ではなくここにもあるのか:
 *   本番ではadmin/APIはクラウド側（Cloudflare Tunnel経由）で動き、プリンターは会場のLANにいる。
 *   クラウドのAPIから会場の 10.x.x.x には到達できないため、eSCLの読み取りは
 *   プリンターと同じLANにいるこのブリッジが行う必要がある。
 *   api/infra/escl.go は開発時（全部が同一LAN）向けに残している。
 *
 * 機種ごとに違う点は本体のScannerCapabilitiesに合わせる（決め打ちしない）:
 *   - リソースパス（mDNSの rs=。多くは "eSCL"）
 *   - 対応解像度（離散値。対応外を要求すると、201で受理されてもスキャンされない機種がある）
 *   - 最大読み取り範囲、カラーモード、出力形式、DocumentFormat / DocumentFormatExt
 */

const http = require('node:http');
const https = require('node:https');
const net = require('node:net');

const A4_WIDTH = 2480; // 1/300インチ単位
const A4_HEIGHT = 3508;
const DEFAULT_DPI = 300;
const DEFAULT_RESOURCE_PATH = 'eSCL';

const REQUEST_TIMEOUT_MS = 30000;
const DOCUMENT_TIMEOUT_MS = 5 * 60 * 1000;
const NEXT_DOCUMENT_RETRY_MS = 2000;
const NEXT_DOCUMENT_MAX_WAIT_MS = 90000;

// ---------------------------------------------------------------------------
// 接続先の検証
// ---------------------------------------------------------------------------

function isPrivateIPv4(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  return false;
}

/**
 * 管理画面から任意のURLを受け取る仕様への歯止め。
 * スキャナは同一LAN上にいる前提なので、プライベートIPと .local 名だけを許可する。
 * link-local（169.254.x.x）は許可しない（クラウド環境ではメタデータAPIのアドレスになる）。
 */
function validateHost(hostname) {
  if (!hostname) throw new Error('スキャナのホスト名が空です');

  const version = net.isIP(hostname);
  if (version === 4) {
    if (!isPrivateIPv4(hostname)) {
      throw new Error('スキャナの接続先はプライベートIPアドレスのみ指定できます: ' + hostname);
    }
    return;
  }
  if (version === 6) {
    const lower = hostname.toLowerCase();
    if (lower === '::1' || lower.startsWith('fd') || lower.startsWith('fc')) return;
    throw new Error('スキャナの接続先はプライベートIPアドレスのみ指定できます: ' + hostname);
  }

  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower.endsWith('.local')) return;
  throw new Error('スキャナの接続先はプライベートIPアドレスか .local 名で指定してください: ' + hostname);
}

/**
 * 接続先を正規化する。
 *   192.168.1.5            -> http://192.168.1.5/eSCL
 *   http://192.168.1.5     -> http://192.168.1.5/eSCL
 *   http://192.168.1.5/eSCL -> そのまま
 */
function normalizeTarget(rawTarget) {
  let text = String(rawTarget || '').trim();
  if (!text) throw new Error('スキャナの接続先が指定されていません');
  if (!text.includes('://')) text = 'http://' + text;

  let url;
  try {
    url = new URL(text.replace(/\/+$/, ''));
  } catch {
    throw new Error('スキャナの接続先URLが不正です: ' + rawTarget);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('スキャナの接続先URLはhttpまたはhttpsで指定してください: ' + rawTarget);
  }
  validateHost(url.hostname.replace(/^\[|\]$/g, ''));
  if (!url.pathname || url.pathname === '/') url.pathname = '/' + DEFAULT_RESOURCE_PATH;
  url.search = '';
  url.hash = '';
  return url;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function request(url, options) {
  const transport = url.protocol === 'https:' ? https : http;
  const timeoutMs = options.timeoutMs || REQUEST_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: options.method || 'GET',
        headers: options.headers || {},
        // プリンターは自己署名証明書のことが多い
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), truncated: false }));
        res.on('aborted', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), truncated: true }));
      }
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('タイムアウト (' + timeoutMs + 'ms)')));
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// XML（名前空間プレフィックスが機種ごとに違うため、ローカル名だけで拾う）
// ---------------------------------------------------------------------------

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function firstText(xml, localName) {
  const pattern = new RegExp('<(?:[\\w.-]+:)?' + escapeRegExp(localName) + '(?:\\s[^>]*)?>([^<]*)<', 'i');
  const match = xml.match(pattern);
  return match ? match[1].trim() : '';
}

function allTexts(xml, localName) {
  const pattern = new RegExp('<(?:[\\w.-]+:)?' + escapeRegExp(localName) + '(?:\\s[^>]*)?>([^<]*)<', 'gi');
  const values = [];
  let match;
  while ((match = pattern.exec(xml)) !== null) {
    const value = match[1].trim();
    if (value && !values.includes(value)) values.push(value);
  }
  return values;
}

function firstBlock(xml, localName) {
  const pattern = new RegExp(
    '<(?:[\\w.-]+:)?' + escapeRegExp(localName) + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?' + escapeRegExp(localName) + '>',
    'i'
  );
  const match = xml.match(pattern);
  return match ? match[1] : '';
}

function allBlocks(xml, localName) {
  const pattern = new RegExp(
    '<(?:[\\w.-]+:)?' + escapeRegExp(localName) + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?' + escapeRegExp(localName) + '>',
    'gi'
  );
  const blocks = [];
  let match;
  while ((match = pattern.exec(xml)) !== null) blocks.push(match[1]);
  return blocks;
}

function parseCapabilities(xml) {
  // 原稿台（Platen）の設定を対象にする。ADF付き機種はADF側にも同じ構造があるため絞り込む
  const platen = firstBlock(xml, 'PlatenInputCaps') || xml;

  const resolutions = [];
  for (const block of allBlocks(platen, 'DiscreteResolution')) {
    const x = Number(firstText(block, 'XResolution'));
    const y = Number(firstText(block, 'YResolution'));
    if (x > 0 && x === y && !resolutions.includes(x)) resolutions.push(x);
  }

  return {
    version: firstText(xml, 'Version'),
    makeAndModel: firstText(xml, 'MakeAndModel'),
    maxWidth: Number(firstText(platen, 'MaxWidth')) || 0,
    maxHeight: Number(firstText(platen, 'MaxHeight')) || 0,
    colorModes: allTexts(platen, 'ColorMode'),
    documentFormats: allTexts(platen, 'DocumentFormat'),
    documentFormatsExt: allTexts(platen, 'DocumentFormatExt'),
    resolutions: resolutions,
  };
}

function parseStatus(xml) {
  const job = firstBlock(xml, 'JobInfo');
  return {
    state: firstText(xml, 'State'),
    jobState: job ? firstText(job, 'JobState') : '',
    jobReasons: job ? allTexts(job, 'JobStateReason') : [],
    imagesCompleted: job ? Number(firstText(job, 'ImagesCompleted')) || 0 : 0,
  };
}

// ---------------------------------------------------------------------------
// 要求条件の決定（本体の対応状況へ寄せる）
// ---------------------------------------------------------------------------

function resolveSettings(caps, options) {
  const settings = {
    dpi: options.dpi > 0 ? options.dpi : DEFAULT_DPI,
    width: A4_WIDTH,
    height: A4_HEIGHT,
    colorMode: options.colorMode || '',
    format: 'image/jpeg',
    useFormatExt: false,
  };
  if (!caps) {
    if (!settings.colorMode) settings.colorMode = 'RGB24';
    return settings;
  }

  // 解像度: 希望値以下で最大の対応値。無ければ最小の対応値
  if (caps.resolutions.length > 0) {
    const below = caps.resolutions.filter((dpi) => dpi <= settings.dpi);
    settings.dpi = below.length > 0 ? Math.max(...below) : Math.min(...caps.resolutions);
  }

  // 読み取り範囲: 本体の最大値でクランプ
  if (caps.maxWidth > 0 && caps.maxWidth < settings.width) settings.width = caps.maxWidth;
  if (caps.maxHeight > 0 && caps.maxHeight < settings.height) settings.height = caps.maxHeight;

  // カラーモード
  if (caps.colorModes.length > 0) {
    if (!caps.colorModes.includes(settings.colorMode)) {
      settings.colorMode = caps.colorModes.includes('RGB24') ? 'RGB24' : caps.colorModes[0];
    }
  } else if (!settings.colorMode) {
    settings.colorMode = 'RGB24';
  }

  // 出力形式: JPEG > PDF > 先頭。DocumentFormatExt を申告する機種はそちらの要素で要求する
  let formats = caps.documentFormats;
  if (caps.documentFormatsExt.length > 0) {
    settings.useFormatExt = true;
    formats = caps.documentFormatsExt;
  }
  if (formats.length > 0) {
    if (formats.includes('image/jpeg')) settings.format = 'image/jpeg';
    else if (formats.includes('application/pdf')) settings.format = 'application/pdf';
    else settings.format = formats[0];
  }

  return settings;
}

function buildScanSettings(settings) {
  const formatElement = settings.useFormatExt
    ? '<scan:DocumentFormatExt>' + settings.format + '</scan:DocumentFormatExt>'
    : '<pwg:DocumentFormat>' + settings.format + '</pwg:DocumentFormat>';

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<scan:ScanSettings xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:escl="http://schemas.hp.com/imaging/escl/2011/05/03">',
    '  <pwg:Version>2.6</pwg:Version>',
    '  <pwg:ScanRegions>',
    '    <pwg:ScanRegion>',
    '      <pwg:XOffset>0</pwg:XOffset>',
    '      <pwg:YOffset>0</pwg:YOffset>',
    '      <pwg:Width>' + settings.width + '</pwg:Width>',
    '      <pwg:Height>' + settings.height + '</pwg:Height>',
    '      <pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits>',
    '    </pwg:ScanRegion>',
    '  </pwg:ScanRegions>',
    '  <pwg:InputSource>Platen</pwg:InputSource>',
    '  ' + formatElement,
    '  <scan:ColorMode>' + settings.colorMode + '</scan:ColorMode>',
    '  <scan:XResolution>' + settings.dpi + '</scan:XResolution>',
    '  <scan:YResolution>' + settings.dpi + '</scan:YResolution>',
    '</scan:ScanSettings>',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// クライアント
// ---------------------------------------------------------------------------

class EsclClient {
  constructor(rawTarget) {
    this.baseUrl = normalizeTarget(rawTarget);
    this.capsCache = null;
  }

  get target() {
    return this.baseUrl.toString();
  }

  endpoint(suffix) {
    return new URL(this.baseUrl.toString() + suffix);
  }

  async capabilities() {
    if (this.capsCache) return this.capsCache;

    let res;
    try {
      res = await request(this.endpoint('/ScannerCapabilities'), {});
    } catch (error) {
      throw new Error('スキャナに接続できませんでした (' + this.target + '): ' + error.message);
    }
    if (res.status !== 200) {
      throw new Error(
        'ScannerCapabilities が HTTP ' + res.status + ' を返しました（この機種はeSCL非対応か、リソースパスが違う可能性があります）'
      );
    }

    const caps = parseCapabilities(res.body.toString('utf8'));
    this.capsCache = caps;
    return caps;
  }

  async status() {
    const res = await request(this.endpoint('/ScannerStatus'), {});
    if (res.status !== 200) throw new Error('ScannerStatus が HTTP ' + res.status + ' を返しました');
    return parseStatus(res.body.toString('utf8'));
  }

  async statusSummary() {
    try {
      const status = await this.status();
      let summary = '本体状態=' + status.state;
      if (status.jobState) {
        summary += ', 直近ジョブ=' + status.jobState + ', 生成画像=' + status.imagesCompleted;
        if (status.jobReasons.length > 0) summary += ' (' + status.jobReasons.join(',') + ')';
      }
      return summary;
    } catch {
      return '本体の状態も取得できませんでした（電源が切れていないか確認してください）';
    }
  }

  async scan(options = {}) {
    let caps = null;
    try {
      caps = await this.capabilities();
    } catch {
      // 対応状況が取れない機種でも既定値で試す
    }
    const settings = resolveSettings(caps, options);

    const jobUrl = await this.createJob(settings);
    try {
      const result = await this.fetchNextDocument(jobUrl);
      result.dpi = settings.dpi;
      result.colorMode = settings.colorMode;
      result.makeAndModel = caps ? caps.makeAndModel : '';
      return result;
    } catch (error) {
      throw new Error(error.message + '（' + (await this.statusSummary()) + '）');
    } finally {
      // ジョブを残すと次のスキャンを受け付けない機種があるため必ず削除を試みる
      request(jobUrl, { method: 'DELETE', timeoutMs: 10000 }).catch(() => {});
    }
  }

  async createJob(settings) {
    const body = buildScanSettings(settings);
    let res;
    try {
      res = await request(this.endpoint('/ScanJobs'), {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
        body: body,
      });
    } catch (error) {
      throw new Error('スキャンジョブを作成できませんでした (' + this.target + '): ' + error.message);
    }

    if (res.status === 409 || res.status === 503) {
      throw new Error('スキャナが使用中です (HTTP ' + res.status + ')');
    }
    if (res.status !== 201) {
      throw new Error(
        'スキャンジョブの作成に失敗しました (HTTP ' + res.status + ') 要求条件: ' + settings.dpi + 'dpi ' + settings.colorMode + ' ' + settings.format
      );
    }

    const location = res.headers.location;
    if (!location) throw new Error('スキャンジョブのLocationヘッダーが返りませんでした');
    // 相対パスで返る機種もあるためベースURLで解決する
    return new URL(location, this.baseUrl);
  }

  async fetchNextDocument(jobUrl) {
    const deadline = Date.now() + NEXT_DOCUMENT_MAX_WAIT_MS;
    const documentUrl = new URL(jobUrl.toString().replace(/\/$/, '') + '/NextDocument');

    for (;;) {
      let res;
      try {
        res = await request(documentUrl, { timeoutMs: DOCUMENT_TIMEOUT_MS });
      } catch (error) {
        throw new Error('スキャン画像の取得に失敗しました: ' + error.message);
      }

      if (res.status === 200) {
        if (res.truncated) {
          throw new Error('スキャン画像の転送が途中で切れました（' + res.body.length + ' バイト受信）');
        }
        if (res.body.length === 0) throw new Error('スキャナから画像を取得できませんでした');
        return { data: res.body, contentType: res.headers['content-type'] || 'image/jpeg' };
      }
      if (res.status === 404 || res.status === 410) {
        throw new Error('スキャナから画像を取得できませんでした。原稿がセットされているか確認してください。');
      }
      if (res.status === 503) {
        if (Date.now() > deadline) {
          throw new Error('スキャナの準備が終わりませんでした（' + NEXT_DOCUMENT_MAX_WAIT_MS / 1000 + '秒待機）');
        }
        await new Promise((resolve) => setTimeout(resolve, NEXT_DOCUMENT_RETRY_MS));
        continue;
      }
      throw new Error('スキャン画像の取得に失敗しました (HTTP ' + res.status + ')');
    }
  }
}

module.exports = { EsclClient: EsclClient, normalizeTarget: normalizeTarget };
