# scanner-bridge

管理画面（admin）からスキャナを使うためのローカルHTTPサーバー。

ブラウザにはスキャナを操作するAPIが無いため、ホスト上でこのサーバーを動かし、
admin から `fetch` して画像を受け取る。スキャン自体は Windows の WIA
（Windows Image Acquisition）経由で行うので、**USB接続のプリンターでもそのまま使える**。

プリンターがネットワークに接続されている場合は、このブリッジを起動しなくても
APIサーバー側のeSCL経路（`POST /scan`）が使える。管理画面ではどちらの経路も選べる。

| 経路 | 実装 | 前提 |
| --- | --- | --- |
| USB接続 | `scanner-bridge/`（WIA） | 管理画面を開くPCにプリンターがUSB接続され、ここを起動している |
| ネットワーク接続 | `api/infra/escl.go`（eSCL） | プリンターがLAN上にあり、`SCANNER_ESCL_URL` を設定している |

## 動作環境

- Windows（WIAを使うため）
- Node.js（追加パッケージのインストールは不要）
- スキャナードライバーがインストール済みで、プリンターの電源が入っていること

## 起動

```bash
node scanner-bridge/server.js
```

```
[scanner-bridge] listening on http://127.0.0.1:8090
[scanner-bridge] allowed origins: http://localhost:3000, http://127.0.0.1:3000
[scanner-bridge] endpoints: GET /health, GET /devices, POST /scan?dpi=300
```

起動したまま管理画面（http://localhost:3000）を開き、「花火を追加」の
**🖨️ スキャナから読み取る** で `USB接続（ローカルブリッジ）` を選ぶ。

## エンドポイント

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/health` | 起動確認。認識しているスキャナの台数を返す |
| GET | `/devices` | WIAが認識しているスキャナの一覧（同一機の重複登録は統合済み） |
| GET | `/discover?timeoutMs=4000` | mDNSでLAN上のスキャナを検出（**Windows以外でも動く**） |
| GET | `/escl/status?target=<url>` | LAN上のeSCLスキャナの機種名・対応解像度（**Windows以外でも動く**） |
| POST | `/scan?target=<url>&dpi=300` | LAN上のプリンターへ**eSCLで直接**読み取りを要求（**Windows以外でも動く**） |

### なぜeSCLもブリッジが行うのか
本番ではAPIサーバーがクラウド側（Cloudflare Tunnel経由）にいて、会場のLAN（`10.x.x.x`）には
到達できません。プリンターと同じLANにいるのはこのブリッジだけなので、
LAN上のプリンターへのeSCL読み取りもここで行います（`escl.js`）。
管理画面はブリッジが起動していれば自動的にブリッジ経由でeSCLを使います。

### 本番（公開サイト）から使うときの注意
- 管理画面の本番オリジン（`https://hanabi-admin.nutfes.net` / `-stg`）は既定で許可済みです。
  別のドメインで動かす場合は `SCANNER_BRIDGE_ALLOW_ORIGIN` に追加してください
- 許可リストに無いOriginからの要求は **403で拒否**します（悪意あるページからの
  スキャン起動を防ぐため。Origin無しの `curl` は通ります）
- スキャンの起動は `POST` のみ（`GET` は受け付けない）
- Chromeは公開サイト→`localhost` のfetchで「ローカルネットワークへのアクセス」の許可を求めます。
  プリフライトには `Access-Control-Allow-Private-Network: true` を返しています
- **Safariは非対応**（公開HTTPSページから `http://localhost` への通信を遮断する）。Chrome/Edgeを使ってください

### 「1台なのに複数検出される」ことへの対応（`/devices`）
Windowsは1台のプリンターを、接続方法とドライバーの組み合わせごとに別デバイスとして登録します。

| 名前の例 | ポートの例 | 中身 |
| --- | --- | --- |
| `Canon TS8330 series` | `\\.\Usbscan0` | USB / メーカー純正WIAドライバー |
| `Canon TS8330 series` | `SWD\EsclUsb\...` | USB / MicrosoftのeSCL-USBクラスドライバー |
| `TS8330 series _F96B4C000000` | `urn:uuid:.../Scanner` | ネットワーク / WSD |
| `Canon TS8330 series` | `SWD\Escl\...` | ネットワーク / eSCL |

さらに**切断後も登録が残る**ため、USBを抜いても一覧に出続けます。そのため `/devices` は:

- 名前・UUID・MACアドレスのいずれかを共有する登録を**同一機として1件に統合**し、
  残りは `alternates` に入れる（ネットワーク登録同士は名前が違うので、UUIDで突き合わせる）
- PnPデバイスの実在フラグと突き合わせて `present` を付ける（未接続の登録は `false`）
- `connection` で `usb` / `network` / `unknown` を示す
- `connectedCount`（接続中）と `registeredCount`（登録数）を分けて返す

管理者画面では接続中のものだけが選択でき、未接続の登録は選べないようになっています。
| POST | `/scan?dpi=300&quality=85&deviceId=<id>` | スキャンを実行してJPEGを返す。`deviceId` 省略時は自動選択 |

### 出力形式について
JPEGでの転送を要求するが、対応していないドライバーは指定を黙って無視してBMPを返す
（Canon TS8330の純正WIAドライバーはBMPのみ対応）。A4/300dpiのBMPは26MB前後になり
ブラウザへ渡すには大きすぎるため、その場合は `wia-scan.ps1` 側でJPEGへ変換して返す
（実測: 26MB → 約150KB）。品質は `quality`（既定85）で変えられる。

```bash
curl http://127.0.0.1:8090/health
curl http://127.0.0.1:8090/devices
curl http://127.0.0.1:8090/discover
curl http://127.0.0.1:8090/escl/status?target=192.168.1.50
# POST には -d '' を付ける（PowerShell版は Content-Length 無しの POST を 411 で弾く）
curl -X POST -d '' "http://127.0.0.1:8090/scan?dpi=300" -o scan.jpg
curl -X POST -d '' "http://127.0.0.1:8090/scan?dpi=300&target=192.168.1.50" -o scan.jpg
```

## 2つの実装（同じAPI）

| | PowerShell版 `bridge.ps1` | Node版 `server.js` |
| --- | --- | --- |
| 必要なもの | Windows標準のPowerShellのみ | Node.js |
| 起動 | 管理画面に表示される1行（`start.ps1`） | `node scanner-bridge/server.js` または `start.sh` |
| WIA（USB / Windows登録済み） | ✅ | ✅（Windowsのみ） |
| eSCL（LAN） | ✅ | ✅ |
| mDNS検出 | ✅ | ✅ |
| 対応OS | Windows | Windows / macOS / Linux（macOS・LinuxはeSCLのみ） |

会場のWindows PCでは PowerShell版を使う（インストール不要）。開発やmacOSでは Node版。

### ワンライナー起動（管理画面から配信）
管理画面がブリッジ未検出のとき、画面に次のコマンドが表示される（オリジンは表示元に合わせて埋め込まれる）。

```powershell
# Windows（PowerShell）
$env:HANABI_ADMIN_ORIGIN='https://<管理画面のドメイン>'; irm https://<管理画面のドメイン>/bridge/start.ps1 | iex
```
```bash
# macOS（ターミナル。Node.js が必要）
HANABI_ADMIN_ORIGIN=https://<管理画面のドメイン> curl -fsSL https://<管理画面のドメイン>/bridge/start.sh | bash
```

- ファイルは管理画面の `/bridge/*`（`admin/app/bridge/[...file]/route.ts`）から配信される。
  デプロイと同時にブリッジも更新され、会場PCには `%LOCALAPPDATA%\hanabi-scanner-bridge`（Macは `~/.hanabi-scanner-bridge`）にコピーが置かれるだけ
- 起動元の管理画面オリジンが自動で許可Originに追加されるため、**nutfes以外のドメインにデプロイしても動く**

### LAN上のスキャナ検出（`/discover`）
DockerコンテナへはmDNSのマルチキャストが届かないため、**LANの検出はホスト側のこのブリッジが担当**します。
検出結果の `escl.url` を管理画面がAPIの `target` パラメータへ渡すことで、
コンテナからはユニキャストのHTTPだけでスキャンできます。

```json
{
  "model": "Canon TS8330 series",
  "address": "10.167.153.254",
  "services": ["_uscan._tcp", "_uscans._tcp", "_ipp._tcp"],
  "scanSupported": true,
  "escl": { "url": "http://10.167.153.254/eSCL", "resourcePath": "eSCL", "version": "2.63" }
}
```

- eSCLのリソースパスはTXTレコードの `rs=` から取るため、`/eSCL` 固定ではありません
- `_scanner._tcp` だけを広告する機種（メーカー独自プロトコルのみ）は `scanSupported: false` になります
- 送出インターフェースを明示して**IPv4の全インターフェースへ**問い合わせます
  （指定しないとWSL等の仮想アダプタから送ってしまい、実際のLANに届きません）
- WSL等の仮想アダプタしか無い環境や、クライアント分離されたWi-Fiでは検出できません。
  その場合は管理画面の「手動でIPを入力」を使ってください

## 環境変数

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `SCANNER_BRIDGE_PORT` | `8090` | 待ち受けポート |
| `SCANNER_BRIDGE_HOST` | `127.0.0.1` | 待ち受けアドレス。既定ではこのPCからのみ接続できる |
| `SCANNER_BRIDGE_ALLOW_ORIGIN` | `http://localhost:3000,http://127.0.0.1:3000` | CORSを許可するOrigin（カンマ区切り） |
| `SCANNER_BRIDGE_TIMEOUT_MS` | `300000` | スキャン1回のタイムアウト |
| `SCANNER_BRIDGE_POWERSHELL` | `powershell.exe` | 使用するPowerShellの実行ファイル |

admin側の接続先は `NEXT_PUBLIC_SCANNER_BRIDGE_URL`（既定 `http://localhost:8090`）で変えられる。

## 困ったときは

- **`/devices` が空`[]`／「スキャナが見つかりません」**
  プリンターがWindowsから見えていない。電源とUSBケーブルを確認する。
  `Get-PnpDevice -Class Image` の `Present` が `False` なら未接続。
  スリープから復帰した直後は認識に少し時間がかかることがある。

- **`PowerShellを起動できませんでした`**
  `SCANNER_BRIDGE_POWERSHELL` にPowerShellのフルパスを設定する。

- **管理画面からCORSエラーになる**
  admin のURLが `http://localhost:3000` 以外なら
  `SCANNER_BRIDGE_ALLOW_ORIGIN` にそのOriginを追加する。

- **解像度が反映されない**
  ドライバーが解像度指定を受け付けない場合、警告をログに出して既定値でスキャンを続行する。
  ログに `wia-scan.ps1 warning:` が出ていないか確認する。

## ファイル

- `server.js` … HTTPサーバー。`wia-scan.ps1` を呼び出して結果を返す
- `wia-scan.ps1` … WIA経由で実際にスキャンするPowerShellスクリプト。単体でも使える

```powershell
powershell -ExecutionPolicy Bypass -File scanner-bridge/wia-scan.ps1 -List
powershell -ExecutionPolicy Bypass -File scanner-bridge/wia-scan.ps1 -Out scan.jpg -Dpi 300
```
