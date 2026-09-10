'use strict';

/**
 * 同じプリンターを指しているかを判定するための手がかりを作る。
 *
 * 1台のプリンターは、見つけ方によって全く違う名前・IDで現れる。
 *
 *   WIA(USB/純正)      : "Canon TS8330 series"           port=\\.\Usbscan0
 *   WIA(USB/MSクラス)  : "Canon TS8330 series"           deviceId=SWD\EsclUsb\...
 *   WIA(ネットワークWSD) : "TS8330 series _F96B4C000000"   port=urn:uuid:0000...e4a2/...
 *   WIA(ネットワークeSCL): "Canon TS8330 series"           port=SWD\Escl\0000...e4a2
 *   mDNS(eSCL)         : "Canon TS8330 series"           UUID=0000...e4a2, IP=10.167.153.254
 *
 * これらを別々の機器として並べると「1台しかないのに複数出てくる」ことになるため、
 * 次のいずれかを共有する登録は同一機として扱う。
 *
 *   - 機器UUID / その末尾12桁（MACアドレス相当）… 最も確実
 *   - 型番トークン（"ts8330" など）… 名前が違う登録同士をつなぐ保険
 *   - 正規化した名前
 */

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const HEX12_PATTERN = /\b[0-9a-f]{12}\b/g;

/**
 * 機器固有ではなく、Windowsが全機種共通で使う定数GUID。
 * これを手がかりに含めると、純正WIAドライバーで登録された別のプリンター同士が
 * すべて同一機に統合されてしまうため除外する。
 *
 *   {6BDD1FC6-810F-11D0-BEC7-08002BE2092F} … WIAのデバイスクラスGUID
 *                                            （deviceIdが "{6BDD1FC6-...}\0004" の形になる）
 */
const CONSTANT_UUIDS = new Set(['6bdd1fc6-810f-11d0-bec7-08002be2092f']);

/** 上記の定数GUIDに含まれる、機器固有ではないMAC相当の値 */
const CONSTANT_MACS = new Set(['08002be2092f']);

/**
 * 名前から型番らしいトークンを取り出す。
 * "Canon TS8330 series" と "TS8330 series _F96B4C000000" の両方から "ts8330" を得たい。
 *
 * 英字と数字の両方を含むトークンを候補にするが、"F96B4C000000" のような
 * 16進だけで構成された長いトークンは機器固有IDでありモデル名ではないため除く
 * （別の機器と誤って結びつけないよう、型番トークンは1つに絞る）。
 */
function modelToken(name) {
  if (!name) return '';

  const candidates = String(name)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => {
      if (token.length < 3 || token.length > 12) return false;
      if (!/[a-z]/.test(token) || !/[0-9]/.test(token)) return false;
      // 16進のみ かつ 8桁以上 は機器固有IDの可能性が高い
      if (token.length >= 8 && /^[0-9a-f]+$/.test(token)) return false;
      return true;
    });

  if (candidates.length === 0) return '';

  // 最も長いものを型番とみなす（同じ長さなら先に現れたもの）
  return candidates.reduce((longest, token) => (token.length > longest.length ? token : longest));
}

/** 表示名の揺れ（大小文字・記号・空白）を吸収した比較用の名前 */
function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * 同一性の手がかりを作る。
 *
 * @param {{name?: string, ids?: string[], uuid?: string}} input
 *   name … 表示名
 *   ids  … deviceIdやポート文字列など、UUIDやMACが埋まっている可能性のある文字列
 *   uuid … 判明している機器UUID
 * @returns {string[]} 手がかりの配列（1つでも一致すれば同一機とみなす）
 */
function identityKeys(input) {
  const keys = new Set();

  const name = normalizeName(input.name);
  if (name) keys.add('name:' + name);

  const model = modelToken(input.name);
  if (model) keys.add('model:' + model);

  const haystack = [input.uuid || '', ...(input.ids || [])].join(' ').toLowerCase();

  for (const uuid of haystack.match(UUID_PATTERN) || []) {
    if (CONSTANT_UUIDS.has(uuid)) continue;
    keys.add('uuid:' + uuid);
    // 先頭が固定値の機種があるため、末尾（MAC相当）も手がかりにする
    const mac = uuid.slice(-12);
    if (!CONSTANT_MACS.has(mac)) keys.add('mac:' + mac);
  }
  for (const hex of haystack.match(HEX12_PATTERN) || []) {
    if (CONSTANT_MACS.has(hex)) continue;
    keys.add('mac:' + hex);
  }

  return Array.from(keys);
}

module.exports = { identityKeys: identityKeys, modelToken: modelToken, normalizeName: normalizeName };
