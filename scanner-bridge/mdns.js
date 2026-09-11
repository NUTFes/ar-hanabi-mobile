'use strict';

/**
 * mDNS（マルチキャストDNS）でLAN上のスキャナを検出する。
 *
 * APIサーバー（Dockerコンテナ）からはマルチキャストがLANへ届かないため、
 * 検出はホスト上で動くこのブリッジが担当する。検出したアドレスを管理画面が
 * APIの target パラメータへ渡すことで、コンテナからはユニキャストのHTTPだけで
 * スキャンできる。
 *
 * 探すサービス:
 *   _uscan._tcp   … eSCL（AirPrint Scan / AirScan）。これがあればAPI経路で使える
 *   _uscans._tcp  … eSCL over TLS
 *   _scanner._tcp … メーカー独自のスキャンサービス（eSCL非対応機の判別に使う）
 *   _ipp._tcp     … 印刷。スキャン非対応でも機種名が取れるため参考情報として拾う
 *
 * TXTレコードの rs= がeSCLのリソースパス（多くは "eSCL"）なので、
 * パスを決め打ちせずここで取得した値を使う。
 */

const dgram = require('node:dgram');
const os = require('node:os');
const { identityKeys } = require('./identity');

const MDNS_ADDRESS = '224.0.0.251';
const MDNS_PORT = 5353;

const SERVICE_ESCL = '_uscan._tcp.local';
const SERVICE_ESCL_TLS = '_uscans._tcp.local';
const SERVICE_VENDOR_SCAN = '_scanner._tcp.local';
const SERVICE_IPP = '_ipp._tcp.local';

const SERVICES = [SERVICE_ESCL, SERVICE_ESCL_TLS, SERVICE_VENDOR_SCAN, SERVICE_IPP];

const DEFAULT_TIMEOUT_MS = 4000;
const DEFAULT_RESOURCE_PATH = 'eSCL';

function encodeName(name) {
  const labels = name
    .split('.')
    .filter(Boolean)
    .map((part) => {
      const label = Buffer.from(part, 'utf8');
      return Buffer.concat([Buffer.from([label.length]), label]);
    });
  return Buffer.concat(labels.concat([Buffer.from([0])]));
}

function buildQuery(names) {
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0, 0); // ID
  header.writeUInt16BE(0, 2); // flags: standard query
  header.writeUInt16BE(names.length, 4); // QDCOUNT
  const questions = names.map((name) =>
    Buffer.concat([
      encodeName(name),
      Buffer.from([0x00, 0x0c]), // QTYPE = PTR
      Buffer.from([0x00, 0x01]), // QCLASS = IN
    ])
  );
  return Buffer.concat([header].concat(questions));
}

// 圧縮ポインタに対応した名前の読み出し
function readName(buffer, offset) {
  const labels = [];
  let position = offset;
  let jumped = false;
  let end = offset;

  while (position < buffer.length) {
    const length = buffer[position];
    if (length === 0) {
      if (!jumped) end = position + 1;
      break;
    }
    if ((length & 0xc0) === 0xc0) {
      const pointer = ((length & 0x3f) << 8) | buffer[position + 1];
      if (!jumped) end = position + 2;
      position = pointer;
      jumped = true;
      continue;
    }
    labels.push(buffer.subarray(position + 1, position + 1 + length).toString('utf8'));
    position += 1 + length;
    if (!jumped) end = position;
  }

  return { name: labels.join('.'), end: end };
}

function parseMessage(buffer, collected) {
  const questionCount = buffer.readUInt16BE(4);
  const total = buffer.readUInt16BE(6) + buffer.readUInt16BE(8) + buffer.readUInt16BE(10);

  let offset = 12;
  for (let i = 0; i < questionCount; i += 1) {
    offset = readName(buffer, offset).end + 4;
  }

  for (let i = 0; i < total && offset < buffer.length; i += 1) {
    const nameParsed = readName(buffer, offset);
    offset = nameParsed.end;
    if (offset + 10 > buffer.length) break;

    const type = buffer.readUInt16BE(offset);
    const dataLength = buffer.readUInt16BE(offset + 8);
    const dataStart = offset + 10;
    offset = dataStart + dataLength;

    if (type === 12) {
      // PTR: サービス名 -> インスタンス名
      collected.ptr.push({ service: nameParsed.name, instance: readName(buffer, dataStart).name });
    } else if (type === 33 && dataLength >= 6) {
      // SRV: インスタンス名 -> ホスト名 + ポート
      collected.srv.set(nameParsed.name, {
        port: buffer.readUInt16BE(dataStart + 4),
        host: readName(buffer, dataStart + 6).name,
      });
    } else if (type === 1 && dataLength === 4) {
      // A: ホスト名 -> IPv4
      collected.a.set(nameParsed.name, Array.from(buffer.subarray(dataStart, dataStart + 4)).join('.'));
    } else if (type === 16) {
      // TXT: key=value の羅列
      const values = {};
      let cursor = dataStart;
      while (cursor < dataStart + dataLength) {
        const length = buffer[cursor];
        const entry = buffer.subarray(cursor + 1, cursor + 1 + length).toString('utf8');
        const separator = entry.indexOf('=');
        if (separator > 0) {
          values[entry.slice(0, separator).toLowerCase()] = entry.slice(separator + 1);
        }
        cursor += 1 + length;
      }
      collected.txt.set(nameParsed.name, values);
    }
  }
}

// 送出インターフェースを明示しないと、仮想アダプタ（WSL等）から送って
// 実際のLANに届かないことがあるため、IPv4の全インターフェースへ送る
function localIPv4Addresses() {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const entry of interfaces[name] || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

function serviceLabel(serviceName) {
  return serviceName.replace(/\.local$/, '');
}

/**
 * LAN上のスキャナを検出する。
 * @param {{timeoutMs?: number}} options
 * @returns {Promise<Array>} 機器ごとにまとめた検出結果
 */
function discover(options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const collected = { ptr: [], srv: new Map(), a: new Map(), txt: new Map() };
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    let settled = false;

    socket.on('error', (error) => {
      if (settled) return;
      settled = true;
      try {
        socket.close();
      } catch {
        // すでに閉じている場合は無視
      }
      reject(new Error('mDNSソケットを開けませんでした: ' + error.message));
    });

    socket.on('message', (message) => {
      try {
        parseMessage(message, collected);
      } catch {
        // 壊れた応答は無視する
      }
    });

    socket.bind(MDNS_PORT, () => {
      socket.setMulticastTTL(255);

      const query = buildQuery(SERVICES);
      const addresses = localIPv4Addresses();

      // インターフェースを1つずつ指定して同じクエリを送る
      const targets = addresses.length > 0 ? addresses : [''];
      const sendAll = () => {
        for (const address of targets) {
          try {
            if (address) socket.setMulticastInterface(address);
          } catch {
            // 非対応のインターフェースは飛ばす
          }
          try {
            socket.send(query, MDNS_PORT, MDNS_ADDRESS);
          } catch {
            // 送れないインターフェースは飛ばす
          }
        }
      };

      for (const address of targets) {
        try {
          socket.addMembership(MDNS_ADDRESS, address || undefined);
        } catch {
          // 参加済み・非対応のインターフェースは飛ばす
        }
      }
      sendAll();

      // 1回のクエリだと応答を取りこぼすことがある（起動直後や、機器が
      // スリープから復帰する途中など）。待っている間に1度だけ再送する
      const resendTimer = setTimeout(sendAll, Math.min(1200, timeoutMs / 2));

      setTimeout(() => {
        if (settled) return;
        settled = true;
        clearTimeout(resendTimer);
        try {
          socket.close();
        } catch {
          // 無視
        }
        resolve(buildResults(collected));
      }, timeoutMs);
    });
  });
}

/**
 * 同じ機器がサービスごとに別々の応答で返り、SRV/Aレコードが揃わないことがある
 * （例: _uscan は解決できたが _ipp はアドレス不明として別機器に見える）。
 * mDNSのインスタンス名は機器ごとに一意なので、それが同じものは1台にまとめる。
 */
function mergeByInstanceName(devices) {
  const byName = new Map();
  const merged = [];

  for (const device of devices) {
    const existing = byName.get(device.name);
    if (!existing) {
      byName.set(device.name, device);
      merged.push(device);
      continue;
    }

    for (const service of device.services) {
      if (!existing.services.includes(service)) existing.services.push(service);
    }
    if (!existing.address && device.address) existing.address = device.address;
    if (!existing.host && device.host) existing.host = device.host;
    if (!existing.model && device.model) existing.model = device.model;
    if (!existing.escl && device.escl) existing.escl = device.escl;
  }

  return merged;
}

function buildResults(collected) {
  // 同じ機器が複数サービスで現れるため、IPアドレス（無ければホスト名）でまとめる
  const devices = new Map();

  for (const entry of collected.ptr) {
    const srv = collected.srv.get(entry.instance);
    const host = srv ? srv.host : null;
    const address = host ? collected.a.get(host) || null : null;
    const txt = collected.txt.get(entry.instance) || {};

    const key = address || host || entry.instance;
    if (!devices.has(key)) {
      devices.set(key, {
        name: entry.instance.split('.')[0],
        model: txt.ty || '',
        host: host,
        address: address,
        // 機器UUID。WIA側の登録（ポート文字列に同じUUIDが入る）と
        // 突き合わせて、同じプリンターを二重に並べないために使う
        uuid: txt.uuid || '',
        services: [],
        escl: null,
        vendorScanOnly: false,
      });
    }

    const device = devices.get(key);
    const label = serviceLabel(entry.service);
    if (!device.services.includes(label)) device.services.push(label);
    if (!device.model && txt.ty) device.model = txt.ty;
    if (!device.host && host) device.host = host;
    if (!device.address && address) device.address = address;
    if (!device.uuid && txt.uuid) device.uuid = txt.uuid;

    // eSCLのサービスならAPIへ渡せるURLを組む。パスはTXTの rs= に従う
    if (entry.service === SERVICE_ESCL || entry.service === SERVICE_ESCL_TLS) {
      const tls = entry.service === SERVICE_ESCL_TLS;
      const resourcePath = (txt.rs || DEFAULT_RESOURCE_PATH).replace(/^\/+|\/+$/g, '');
      const port = srv ? srv.port : tls ? 443 : 80;
      const hostForUrl = address || host;

      // 平文(80)を優先する。TLSは自己署名証明書で弾かれることが多い
      if (hostForUrl && (!device.escl || (!tls && device.escl.tls))) {
        const scheme = tls ? 'https' : 'http';
        const isDefaultPort = (tls && port === 443) || (!tls && port === 80);
        const authority = isDefaultPort ? hostForUrl : hostForUrl + ':' + port;
        device.escl = {
          url: scheme + '://' + authority + '/' + resourcePath,
          port: port,
          tls: tls,
          resourcePath: resourcePath,
          version: txt.vers || '',
          colorModes: txt.cs || '',
          inputSources: txt.is || '',
          formats: txt.pdl || '',
        };
      }
    }
  }

  const results = mergeByInstanceName(Array.from(devices.values()));
  for (const device of results) {
    // eSCLが無く独自スキャンサービスだけの機器は、この経路では使えない
    device.vendorScanOnly = !device.escl && device.services.includes('_scanner._tcp');
    device.scanSupported = Boolean(device.escl);
    // WIA経由で見えている同じプリンターと突き合わせるための手がかり
    device.identityKeys = identityKeys({
      name: device.model || device.name,
      uuid: device.uuid,
      ids: [device.host || '', device.address || ''],
    });
  }

  // eSCL対応機を先に、その中では名前順で返す（管理画面の並びを安定させる）
  results.sort((left, right) => {
    if (left.scanSupported !== right.scanSupported) return left.scanSupported ? -1 : 1;
    return (left.model || left.name).localeCompare(right.model || right.name);
  });

  return results;
}

module.exports = { discover: discover };
