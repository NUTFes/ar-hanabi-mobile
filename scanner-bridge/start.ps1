# スキャナーブリッジ（PowerShell版）の起動用ワンライナーの本体。
#
# 管理画面に表示されるコマンドから呼ばれる:
#   $env:HANABI_ADMIN_ORIGIN='https://hanabi-admin.nutfes.net'; irm https://hanabi-admin.nutfes.net/bridge/start.ps1 | iex
#
# やること:
#   1. 管理画面から bridge.ps1 と wia-scan.ps1 を取得して %LOCALAPPDATA%\hanabi-scanner-bridge に置く
#      （PowerShell 5.1 がUTF-8を正しく読めるよう、BOM付きで保存する）
#   2. 取得元の管理画面オリジンを許可Originとしてブリッジを起動する
#
# Node.js もリポジトリも不要。Windows標準のPowerShellだけで動く。
# ※ iex で実行されるため param ブロックは使えない。設定は環境変数で受け取る。

$ErrorActionPreference = 'Stop'

$origin = $env:HANABI_ADMIN_ORIGIN
if (-not $origin) { $origin = 'http://localhost:3000' }
$origin = $origin.Trim().TrimEnd('/')

$port = 8090
if ($env:HANABI_BRIDGE_PORT) { $port = [int]$env:HANABI_BRIDGE_PORT }

$installDir = Join-Path $env:LOCALAPPDATA 'hanabi-scanner-bridge'
New-Item -ItemType Directory -Force -Path $installDir | Out-Null

Write-Host ('[scanner-bridge] 管理画面 ' + $origin + ' からブリッジを取得します...')

# TLS 1.2 を明示（古い既定だとHTTPSで失敗する環境がある）
try { [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor [System.Net.SecurityProtocolType]::Tls12 } catch { }

$utf8Bom = New-Object System.Text.UTF8Encoding($true)
foreach ($file in @('bridge.ps1', 'wia-scan.ps1')) {
    $url = $origin + '/bridge/' + $file
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
    } catch {
        throw ('ブリッジの取得に失敗しました: ' + $url + ' : ' + $_.Exception.Message)
    }
    # text/plain; charset=utf-8 で配信されるため Content は通常 string（環境によっては byte[]）。
    # PowerShell 5.1 はBOM無しUTF-8ファイルをANSIとして読んでしまうため、BOM付きで保存する
    if ($response.Content -is [string]) {
        $text = $response.Content
    } else {
        $text = [System.Text.Encoding]::UTF8.GetString([byte[]]$response.Content)
    }
    if ($text.Length -gt 0 -and [int]$text[0] -eq 0xFEFF) { $text = $text.Substring(1) }
    [System.IO.File]::WriteAllText((Join-Path $installDir $file), $text, $utf8Bom)
    Write-Host ('[scanner-bridge]   取得: ' + $file + ' (' + $text.Length + ' 文字)')
}

Write-Host ('[scanner-bridge] 起動します（終了は Ctrl+C）: http://localhost:' + $port)
Write-Host ''

$env:HANABI_ADMIN_ORIGIN = $origin
# 別プロセスで起動し、このコンソールに接続したままにする（Ctrl+C で止められる）
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $installDir 'bridge.ps1') -Port $port -ScriptDir $installDir -AllowOrigin $origin
