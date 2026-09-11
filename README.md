# 概要
- AR花火のユーザー画面と管理者画面とAPI・DBのリポジトリ

# ディレクトリ
- user/：ユーザー画面（Vite + React Three Fiber(R3F) + AR.js + Orval）
  - src/
    - apiClient/ : Orvalで生成したAPIクライアント
    - assets/ : フィナーレのタイムラインのcsvファイル
    - canvas/ : R3FのCanvas
      - canvas/hooks/ : ジャンプ検出などのフック
    - scenes/ : R3FのScene
    - pages;  : ページ
    - components/ : 花火とその他ボタン等のコンポーネント
    - lib/ : ローカルストレージやセットアップ用の関数
- admin/ ：管理者画面（Next.js）
- api/ ：APIサーバーとDBマイグレーション（Go + GORM + oapi-codegen）
- scanner-bridge/ ：USB接続のスキャナを管理者画面から使うためのローカルHTTPサーバー（Node + WIA）

# 環境構築
1. メンバーの誰かに`.env`を共有してもらって、プロジェクト直下に`.env`を作成する

# アプリの起動
1. Docker Desktopを起動しておく
2. ターミナルで`docker compose up --build`を実行
3. アクセスできるか確認
  - ユーザー画面：http://localhost:5173
    - イラスト花火：http://localhost:5173
    - ジャンプ花火：http://localhost:5173/detector
    - フィナーレ　：http://localhost:5173/finale
    - デモ　　　　：http://localhost:5173/demo
  - 管理者画面　：http://localhost:3000
  - Swagger UI：http://localhost:8081（APIの動作確認などができます）

# スキャン（管理者画面から紙の絵を取り込む）
管理者画面の「花火を追加」→「🖨️ スキャナから読み取る」で、
**使用できるプリンターをプルダウンから選ぶ**だけで読み取れます。
読み取った画像は、ファイルを選んだときと同じ編集（トリミング）画面に流れます。

## 本番構成での前提（重要）
本番では admin / API はクラウド側（Cloudflare Tunnel 経由の `https://hanabi-admin.nutfes.net` 等）で動き、
プリンターは会場のLANにいます。**クラウドのAPIから会場のプリンターには到達できない**ため、
スキャンの実行はすべて**管理者画面を開くPC上の `scanner-bridge`** が担当します。

```
[ブラウザ] https://hanabi-admin.nutfes.net  ──fetch──▶  http://localhost:8090 (scanner-bridge)
                                                             ├─ WIA  ──▶ USB / Windows登録済みスキャナ
                                                             └─ eSCL ──▶ LAN上のプリンター (10.x.x.x)
[印刷] window.print() / PDF はブラウザ内で完結 ──▶ このPCのWindowsプリンターキュー
```

- **会場のPCでは必ずブリッジを起動**してください。管理画面がブリッジ未検出のとき、画面に
  **起動用の1行コマンド**（Windows: PowerShell / macOS: ターミナル）が表示されます。
  Windowsは**インストール不要**（PowerShell版）、macOSはNode.jsが必要でeSCL（Wi-Fiプリンター）のみ対応
- 個人のCloudflareアカウント等、**nutfes以外のドメインにデプロイしても動きます**
  （コマンドに表示元の管理画面オリジンが埋め込まれ、ブリッジがそれを許可します）
- ブラウザは **Chrome / Edge** を使ってください。公開サイトから `http://localhost` へのfetchは
  Chrome/Edge/Firefoxでは許可されますが、Safariはmixed contentとして遮断します
- Chromeでは初回に「**ローカルネットワーク上のデバイスへのアクセス**」の許可を求めるダイアログが
  出ることがあります。**許可**してください（拒否するとスキャナ一覧が空になります）
- 印刷はブラウザ内で完結するため、デプロイ先に関係なく動きます

## 仕組み（経路は自動で選ばれます）
ブラウザにはスキャナを操作するAPIが無いため、内部では2つの経路を使い分けています。
**どちらを使うかは操作者が選ぶ必要はありません。**

| 経路 | 実装 | 使える条件 |
| --- | --- | --- |
| eSCL | `scanner-bridge/escl.js`（本番・通常）/ `api/infra/escl.go`（開発時のみ） | プリンターがLAN上にあり、eSCLに対応している |
| ブリッジ（WIA） | `scanner-bridge/wia-scan.ps1` | 管理者画面を開くPCがそのスキャナを認識している（USB / ネットワークどちらでも） |

- 両方使える場合は **eSCLを優先**します（ドライバーに依存せず、JPEGを本体が生成する）
- eSCLは**ブリッジが起動していればブリッジから**、いなければAPIから叩きます
  （API経由は全部が同一LANにある開発時だけ成立します）
- 選んだプリンターでスキャンが失敗したら、**もう一方の経路を自動で試します**
- 同じプリンターが両方の経路で見つかっても、**プルダウンには1台としてまとめて**表示します
  （機器UUID・MACアドレス・型番で同一機を判定）

## 一覧に出てくるプリンター
次の3つを集めて統合しています。

- ホスト側 `scanner-bridge` が**mDNSで検出**したLAN上のeSCLスキャナ
- APIの `.env` に**設定済み**のスキャナ（`SCANNER_ESCL_URL`、カンマ区切りで複数可）
- ホスト側 `scanner-bridge` 経由で**Windowsが認識している**スキャナ

使えないものは「使用できません」と表示され選択できません（未接続、eSCL非対応など）。

## 準備
1. プリンターの電源を入れる
   - **ネットワーク接続**：管理者画面を開くPCと同じLANに繋ぐ（これだけで使えます）
   - **USB接続**：PCに繋ぎ、スキャナードライバーを入れておく
2. ホスト側で `node scanner-bridge/server.js` を実行したままにする
   - USB接続のスキャナを使う場合と、**LANの自動検出**に必要です
   - `.env` に接続先を設定済みなら、ネットワーク接続のスキャナはブリッジ無しでも使えます
3. 管理者画面のプルダウンからプリンターを選ぶ（選択内容はブラウザに保存されます）

複数台設定する場合は `.env` にカンマ区切りで書けます。
```
SCANNER_ESCL_URL=http://192.168.1.50,http://192.168.1.51
```

## 1台なのに複数出てくる場合
Windowsは1台のプリンターを、接続方法とドライバーの組み合わせごとに別々に登録します
（USB純正 / USBクラスドライバー / ネットワークWSD / ネットワークeSCL）。
さらに切断後も登録が残るため、USBを抜いても一覧に出続けます。

これらは**すべて1台に統合して表示**します（機器UUID・MACアドレス・型番で判定）。
実際に使えないものは選択できません。詳細は
[scanner-bridge/README.md](./scanner-bridge/README.md) を参照。

## 対応機種について
機種を決め打ちせず、本体が申告する内容に合わせて要求を組み立てます。

- eSCLのリソースパスはmDNSの `rs=` に従う（`/eSCL` 固定ではない）
- 解像度は本体の対応リストから選ぶ（**対応外の値を要求すると、ジョブは受理されるのに
  スキャンされない機種があります**。例: 250dpiを要求すると200dpiへ自動調整）
- 読み取り範囲は本体の最大値でクランプ、カラーモードと出力形式も対応リストから選択

そのため、未検証の機種でも本体がeSCLに対応していればそのまま動くはずです。
対応していない場合は一覧で選択できません（独自プロトコルのみの機種）。

## 動作確認
```bash
# LAN上のスキャナを検出（ホスト側でブリッジを起動しておく）
curl http://127.0.0.1:8090/discover

# APIから見た対応状況（機種名・対応解像度・最大読み取りサイズ）
curl http://localhost:8080/scanners

# 接続確認とスキャン（target省略時は SCANNER_ESCL_URL の1台目）
curl "http://localhost:8080/scan/status?target=192.168.1.50"
curl -X POST "http://localhost:8080/scan?target=192.168.1.50&dpi=300" -o scan.jpg
```

### API経由のeSCL（開発時のみ）と安全対策
`POST /scan?target=` はAPIサーバーから任意のアドレスへHTTPを投げる入口になり得るため（SSRF）、
次のように制限しています。

- `target` は **`SCANNER_ESCL_URL` に設定済みの接続先だけ**受け付ける（それ以外は 403）
- 開発時に設定外のLANアドレスも使いたい場合だけ `SCANNER_ESCL_ALLOW_ANY_TARGET=true` を設定
  （`docker-compose.yaml` の既定は true、**`docker-compose.prod.yaml` は false 固定**）
- 許可するのはプライベートIPと `.local` 名のみ。link-local（`169.254.x.x`、クラウドの
  メタデータAPIのアドレス）は許可しない
- スキャンの起動は `POST` のみ（`GET` は受け付けない）

本番では `SCANNER_ESCL_URL` を設定せず、この経路自体を無効にしておいてください
（eSCLはブリッジが担当するので不要です）。
