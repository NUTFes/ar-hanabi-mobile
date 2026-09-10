<#
.SYNOPSIS
    スキャナーブリッジ（PowerShell版）。管理画面からスキャナを使うためのローカルHTTPサーバー。

.DESCRIPTION
    Node版（server.js）と同じAPIを、Windows標準のPowerShellだけで提供する。
    会場のPCに Node.js やリポジトリを入れなくても、管理画面に表示される1行の
    コマンド（start.ps1 経由）で起動できるようにするためのもの。

      GET  /health                 起動確認・接続中のスキャナ台数
      GET  /devices                Windowsが認識しているスキャナ（WIA、重複登録は統合済み）
      GET  /discover               mDNSでLAN上のeSCLスキャナを検出
      GET  /escl/status?target=    LAN上のeSCLスキャナの機種名・対応解像度
      POST /scan?dpi=&deviceId=    WIAでスキャン（USB / Windows登録済み）
      POST /scan?dpi=&target=      eSCLでLAN上のプリンターから直接スキャン

    本番ではadmin/APIはクラウド側にいて会場のLANに届かないため、
    スキャンの実行（WIAもeSCLも）は必ずこのブリッジ（会場のPC）が行う。

.PARAMETER Port
    待ち受けポート。既定 8090（管理画面の既定 NEXT_PUBLIC_SCANNER_BRIDGE_URL と一致）。

.PARAMETER AllowOrigin
    追加で許可する管理画面のOrigin（カンマ区切り）。環境変数 HANABI_ADMIN_ORIGIN でも指定できる。

.PARAMETER ScriptDir
    wia-scan.ps1 の置き場所。既定はこのスクリプトと同じフォルダ。
#>
param(
    [int]$Port = 8090,
    [string]$AllowOrigin = '',
    [string]$ScriptDir = ''
)

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

if ($ScriptDir -eq '') {
    if ($PSScriptRoot) { $ScriptDir = $PSScriptRoot } else { $ScriptDir = (Get-Location).Path }
}
$WiaScript = Join-Path $ScriptDir 'wia-scan.ps1'

# 管理画面以外のサイトからローカルのスキャナを叩けないよう、許可したOriginだけを受け付ける。
# 既定に開発用localhostと本番・ステージングを含め、ワンライナー起動時は
# 起動元の管理画面オリジン（HANABI_ADMIN_ORIGIN）を自動で足す。
$AllowedOrigins = New-Object System.Collections.Generic.List[string]
foreach ($o in @('http://localhost:3000', 'http://127.0.0.1:3000', 'https://hanabi-admin.nutfes.net', 'https://hanabi-admin-stg.nutfes.net')) { $AllowedOrigins.Add($o) }
foreach ($o in ($AllowOrigin -split ',')) { $t = $o.Trim(); if ($t -ne '' -and -not $AllowedOrigins.Contains($t)) { $AllowedOrigins.Add($t) } }
if ($env:HANABI_ADMIN_ORIGIN) { $t = $env:HANABI_ADMIN_ORIGIN.Trim().TrimEnd('/'); if ($t -ne '' -and -not $AllowedOrigins.Contains($t)) { $AllowedOrigins.Add($t) } }

$DefaultDpi = 300
$MinDpi = 75
$MaxDpi = 1200
$DefaultQuality = 85

# プリンターは自己署名証明書のことが多い（https のeSCL用）
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[System.Net.ServicePointManager]::Expect100Continue = $false

function Write-Log {
    param([string]$Message)
    Write-Host ('[scanner-bridge] ' + $Message)
}

# =============================================================================
# HTTP 応答ヘルパー
# =============================================================================

function Set-CorsHeaders {
    param($Context)
    $origin = $Context.Request.Headers['Origin']
    if ($origin -and $AllowedOrigins.Contains($origin)) {
        $Context.Response.Headers['Access-Control-Allow-Origin'] = $origin
        $Context.Response.Headers['Vary'] = 'Origin'
    }
    $Context.Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    $Context.Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
    $Context.Response.Headers['Access-Control-Max-Age'] = '600'
    # 公開サイト → localhost のfetchでChromeが要求する Private Network Access の応答
    $Context.Response.Headers['Access-Control-Allow-Private-Network'] = 'true'
}

function Send-Bytes {
    param($Context, [int]$Status, [string]$ContentType, [byte[]]$Body, [hashtable]$ExtraHeaders = @{})
    $Context.Response.StatusCode = $Status
    $Context.Response.ContentType = $ContentType
    $Context.Response.Headers['Cache-Control'] = 'no-store'
    foreach ($key in $ExtraHeaders.Keys) { $Context.Response.Headers[$key] = [string]$ExtraHeaders[$key] }
    $Context.Response.ContentLength64 = $Body.Length
    $Context.Response.OutputStream.Write($Body, 0, $Body.Length)
    $Context.Response.OutputStream.Close()
}

function Send-Json {
    param($Context, [int]$Status, $Object)
    $json = ConvertTo-Json -InputObject $Object -Compress -Depth 8
    Send-Bytes -Context $Context -Status $Status -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($json))
}

function Get-QueryParam {
    param($Context, [string]$Name)
    $value = $Context.Request.QueryString[$Name]
    if ($null -eq $value) { return '' }
    return [string]$value
}

function ConvertTo-Dpi {
    param([string]$Raw)
    $dpi = 0
    if (-not [int]::TryParse($Raw, [ref]$dpi)) { return $DefaultDpi }
    return [Math]::Min($MaxDpi, [Math]::Max($MinDpi, $dpi))
}

# =============================================================================
# 同一機判定（identity.js の移植）
# =============================================================================

# 全機種共通の定数GUID。手がかりに含めると別のプリンター同士が統合されてしまう
$ConstantUuids = @('6bdd1fc6-810f-11d0-bec7-08002be2092f')
$ConstantMacs = @('08002be2092f')

function Get-ModelToken {
    param([string]$Name)
    if (-not $Name) { return '' }
    $best = ''
    foreach ($token in ($Name.ToLowerInvariant() -split '[^a-z0-9]+')) {
        if ($token.Length -lt 3 -or $token.Length -gt 12) { continue }
        if ($token -notmatch '[a-z]' -or $token -notmatch '[0-9]') { continue }
        if ($token.Length -ge 8 -and $token -match '^[0-9a-f]+$') { continue }
        if ($token.Length -gt $best.Length) { $best = $token }
    }
    return $best
}

function Get-IdentityKeys {
    param([string]$Name, [string[]]$Ids = @(), [string]$Uuid = '')
    $keys = New-Object System.Collections.Generic.List[string]
    $normalized = ([string]$Name).ToLowerInvariant() -replace '[^a-z0-9]+', ''
    if ($normalized) { $keys.Add('name:' + $normalized) }
    $model = Get-ModelToken -Name $Name
    if ($model) { $keys.Add('model:' + $model) }

    $haystack = (@($Uuid) + $Ids | Where-Object { $_ }) -join ' '
    $haystack = $haystack.ToLowerInvariant()
    foreach ($m in [regex]::Matches($haystack, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')) {
        $u = $m.Value
        if ($ConstantUuids -contains $u) { continue }
        if (-not $keys.Contains('uuid:' + $u)) { $keys.Add('uuid:' + $u) }
        $mac = $u.Substring($u.Length - 12)
        if (-not ($ConstantMacs -contains $mac) -and -not $keys.Contains('mac:' + $mac)) { $keys.Add('mac:' + $mac) }
    }
    foreach ($m in [regex]::Matches($haystack, '\b[0-9a-f]{12}\b')) {
        if ($ConstantMacs -contains $m.Value) { continue }
        if (-not $keys.Contains('mac:' + $m.Value)) { $keys.Add('mac:' + $m.Value) }
    }
    return $keys.ToArray()
}

# =============================================================================
# WIA（wia-scan.ps1 を子プロセスで呼ぶ。実装を二重に持たないため）
# =============================================================================

function Invoke-WiaScript {
    param([string[]]$Arguments)

    if (-not (Test-Path $WiaScript)) {
        throw ('wia-scan.ps1 が見つかりません: ' + $WiaScript)
    }

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = 'powershell.exe'
    $quoted = @('-NoProfile', '-NonInteractive', '-Sta', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $WiaScript + '"'))
    foreach ($a in $Arguments) {
        if ($a -match '[\s"]') { $quoted += ('"' + ($a -replace '"', '\"') + '"') } else { $quoted += $a }
    }
    $psi.Arguments = ($quoted -join ' ')
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.CreateNoWindow = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8

    $proc = [System.Diagnostics.Process]::Start($psi)
    # stdout と stderr を順に ReadToEnd すると、片方のバッファが埋まった時点で子と親が
    # 互いに待ち合ってデッドロックする。stderr は非同期に読みながら stdout を読む
    $stderrTask = $proc.StandardError.ReadToEndAsync()
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $stderrTask.Result
    $proc.WaitForExit()

    if ($proc.ExitCode -ne 0) {
        # PowerShellはメッセージの後にスタックを続けるため、操作者へは最初の1行だけ
        $first = ''
        foreach ($line in ($stderr -split "`r?`n")) {
            $t = $line.Trim()
            if ($t -eq '' -or $t.StartsWith('WARNING:') -or $t.StartsWith('At ') -or $t.StartsWith('+') -or $t.StartsWith('CategoryInfo')) { continue }
            $first = $t; break
        }
        if ($first -eq '') { $first = 'wia-scan.ps1 が異常終了しました (exit ' + $proc.ExitCode + ')' }
        Write-Log ('wia-scan.ps1 stderr: ' + $stderr.Trim())
        throw $first
    }
    if ($stderr.Trim() -ne '') { Write-Log ('wia-scan.ps1 warning: ' + $stderr.Trim()) }

    # 警告がstdoutに混ざる環境でもJSONだけを拾う
    $text = $stdout.Trim()
    $start = $text.IndexOfAny([char[]]@('{', '['))
    if ($start -lt 0) { throw ('wia-scan.ps1 の出力にJSONが見つかりませんでした: ' + $text.Substring(0, [Math]::Min(300, $text.Length))) }
    return ($text.Substring($start) | ConvertFrom-Json)
}

function Get-DeviceRank {
    param($Device)
    $score = 0
    if (-not $Device.present) { $score += 100 }
    if ($Device.type -ne 1) { $score += 2 }
    if ($Device.driverKind -ne 'vendor') { $score += 1 }
    return $score
}

# 1台のプリンターが複数のドライバー・接続方法で登録され複数件に見える問題を統合する
function Get-WiaDevicesGrouped {
    $raw = @(Invoke-WiaScript -Arguments @('-List'))
    $groups = New-Object System.Collections.ArrayList
    $keyToGroup = @{}

    foreach ($device in $raw) {
        $keys = Get-IdentityKeys -Name $device.name -Ids @([string]$device.deviceId, [string]$device.port)
        $matched = New-Object System.Collections.Generic.List[int]
        foreach ($k in $keys) { if ($keyToGroup.ContainsKey($k) -and -not $matched.Contains($keyToGroup[$k])) { $matched.Add($keyToGroup[$k]) } }

        if ($matched.Count -eq 0) {
            $index = $groups.Add(@{ entries = New-Object System.Collections.ArrayList; keys = New-Object System.Collections.Generic.HashSet[string] })
            [void]$groups[$index].entries.Add($device)
            foreach ($k in $keys) { [void]$groups[$index].keys.Add($k); $keyToGroup[$k] = $index }
            continue
        }

        $target = $groups[$matched[0]]
        [void]$target.entries.Add($device)
        foreach ($k in $keys) { [void]$target.keys.Add($k); $keyToGroup[$k] = $matched[0] }
        for ($i = 1; $i -lt $matched.Count; $i++) {
            $merged = $groups[$matched[$i]]
            if ($null -eq $merged) { continue }
            foreach ($e in $merged.entries) { [void]$target.entries.Add($e) }
            foreach ($k in $merged.keys) { [void]$target.keys.Add($k); $keyToGroup[$k] = $matched[0] }
            $groups[$matched[$i]] = $null
        }
    }

    $result = @()
    foreach ($group in $groups) {
        if ($null -eq $group) { continue }
        $sorted = @($group.entries | Sort-Object { Get-DeviceRank $_ })
        $primary = $sorted[0]
        $alternates = @()
        for ($i = 1; $i -lt $sorted.Count; $i++) {
            $e = $sorted[$i]
            $alternates += [pscustomobject]@{ deviceId = $e.deviceId; port = $e.port; driverKind = $e.driverKind; connection = $e.connection; manufacturer = $e.manufacturer; present = [bool]$e.present }
        }
        $allKeys = New-Object System.Collections.Generic.List[string]
        foreach ($e in $group.entries) { foreach ($k in (Get-IdentityKeys -Name $e.name -Ids @([string]$e.deviceId, [string]$e.port))) { if (-not $allKeys.Contains($k)) { $allKeys.Add($k) } } }
        $result += [pscustomobject]@{
            deviceId     = $primary.deviceId
            name         = $primary.name
            port         = $primary.port
            manufacturer = $primary.manufacturer
            type         = $primary.type
            driverKind   = $primary.driverKind
            connection   = $primary.connection
            present      = [bool]$primary.present
            identityKeys = $allKeys.ToArray()
            alternates   = $alternates
        }
    }
    return @($result | Sort-Object { Get-DeviceRank $_ })
}

function Invoke-WiaScan {
    param([int]$Dpi, [int]$Quality, [string]$DeviceId)
    $outPath = Join-Path ([System.IO.Path]::GetTempPath()) ('scanner-bridge-' + [guid]::NewGuid().ToString() + '.jpg')
    $arguments = @('-Out', $outPath, '-Dpi', [string]$Dpi, '-Quality', [string]$Quality)
    if ($DeviceId) { $arguments += @('-DeviceId', $DeviceId) }
    try {
        $meta = Invoke-WiaScript -Arguments $arguments
        $bytes = [System.IO.File]::ReadAllBytes($outPath)
        return @{ data = $bytes; meta = $meta }
    } finally {
        if (Test-Path $outPath) { Remove-Item $outPath -Force -ErrorAction SilentlyContinue }
    }
}

# =============================================================================
# eSCL（escl.js の移植）
# =============================================================================

function Test-PrivateHost {
    param([string]$HostName)
    if (-not $HostName) { throw 'スキャナのホスト名が空です' }
    $ip = $null
    if ([System.Net.IPAddress]::TryParse($HostName, [ref]$ip)) {
        if ($ip.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) {
            $b = $ip.GetAddressBytes()
            $ok = ($b[0] -eq 10) -or ($b[0] -eq 172 -and $b[1] -ge 16 -and $b[1] -le 31) -or ($b[0] -eq 192 -and $b[1] -eq 168) -or ($b[0] -eq 127)
            # link-local（169.254.x.x）は許可しない。クラウド環境ではメタデータAPIのアドレス
            if (-not $ok) { throw ('スキャナの接続先はプライベートIPアドレスのみ指定できます: ' + $HostName) }
            return
        }
        if ([System.Net.IPAddress]::IsLoopback($ip) -or $ip.IsIPv6SiteLocal -or ($ip.GetAddressBytes()[0] -band 0xfe) -eq 0xfc) { return }
        throw ('スキャナの接続先はプライベートIPアドレスのみ指定できます: ' + $HostName)
    }
    $lower = $HostName.ToLowerInvariant()
    if ($lower -eq 'localhost' -or $lower.EndsWith('.local')) { return }
    throw ('スキャナの接続先はプライベートIPアドレスか .local 名で指定してください: ' + $HostName)
}

# 192.168.1.5 / http://192.168.1.5 / http://192.168.1.5/eSCL を http://host/eSCL 形式に揃える
function Get-EsclBaseUri {
    param([string]$RawTarget)
    $text = ([string]$RawTarget).Trim()
    if ($text -eq '') { throw 'スキャナの接続先が指定されていません' }
    if ($text -notmatch '://') { $text = 'http://' + $text }
    $uri = $null
    if (-not [System.Uri]::TryCreate($text.TrimEnd('/'), [System.UriKind]::Absolute, [ref]$uri)) { throw ('スキャナの接続先URLが不正です: ' + $RawTarget) }
    if ($uri.Scheme -ne 'http' -and $uri.Scheme -ne 'https') { throw ('スキャナの接続先URLはhttpまたはhttpsで指定してください: ' + $RawTarget) }
    Test-PrivateHost -HostName $uri.Host
    $path = $uri.AbsolutePath
    if ($path -eq '' -or $path -eq '/') { $path = '/eSCL' }
    $builder = New-Object System.UriBuilder($uri.Scheme, $uri.Host, $uri.Port, $path)
    return $builder.Uri
}

function Invoke-Http {
    param([System.Uri]$Uri, [string]$Method = 'GET', [byte[]]$Body = $null, [string]$ContentType = '', [int]$TimeoutMs = 30000)
    $req = [System.Net.HttpWebRequest]::Create($Uri)
    $req.Method = $Method
    $req.Timeout = $TimeoutMs
    $req.ReadWriteTimeout = $TimeoutMs
    $req.AllowAutoRedirect = $false
    $req.KeepAlive = $false
    if ($Body) {
        $req.ContentType = $ContentType
        $req.ContentLength = $Body.Length
        $stream = $req.GetRequestStream(); $stream.Write($Body, 0, $Body.Length); $stream.Close()
    }
    $resp = $null
    try {
        $resp = $req.GetResponse()
    } catch [System.Net.WebException] {
        if ($_.Exception.Response) { $resp = $_.Exception.Response } else { throw ($_.Exception.Message) }
    }
    try {
        $ms = New-Object System.IO.MemoryStream
        $rs = $resp.GetResponseStream()
        $rs.CopyTo($ms)
        $rs.Close()
        return @{ status = [int]$resp.StatusCode; headers = $resp.Headers; body = $ms.ToArray() }
    } finally { $resp.Close() }
}

function Get-XmlText {
    param([System.Xml.XmlNode]$Node, [string]$LocalName)
    if ($null -eq $Node) { return '' }
    $found = $Node.SelectSingleNode(".//*[local-name()='" + $LocalName + "']")
    if ($null -eq $found) { return '' }
    return $found.InnerText.Trim()
}

function Get-XmlTexts {
    param([System.Xml.XmlNode]$Node, [string]$LocalName)
    $values = @()
    if ($null -eq $Node) { return $values }
    foreach ($n in $Node.SelectNodes(".//*[local-name()='" + $LocalName + "']")) { $v = $n.InnerText.Trim(); if ($v -and $values -notcontains $v) { $values += $v } }
    return $values
}

$EsclCapsCache = @{}

function Get-EsclCapabilities {
    param([System.Uri]$Base)
    $key = $Base.ToString()
    if ($EsclCapsCache.ContainsKey($key)) { return $EsclCapsCache[$key] }

    try { $res = Invoke-Http -Uri ([System.Uri]($key + '/ScannerCapabilities')) } catch { throw ('スキャナに接続できませんでした (' + $key + '): ' + $_.Exception.Message) }
    if ($res.status -ne 200) { throw ('ScannerCapabilities が HTTP ' + $res.status + ' を返しました（この機種はeSCL非対応か、リソースパスが違う可能性があります）') }

    $xml = New-Object System.Xml.XmlDocument
    $xml.LoadXml([System.Text.Encoding]::UTF8.GetString($res.body))
    # 原稿台（Platen）の設定を対象にする。ADF付き機種は同じ構造がADF側にもあるため絞る
    $platen = $xml.SelectSingleNode("//*[local-name()='PlatenInputCaps']")
    if ($null -eq $platen) { $platen = $xml.DocumentElement }

    $resolutions = @()
    foreach ($node in $platen.SelectNodes(".//*[local-name()='DiscreteResolution']")) {
        $x = 0; $y = 0
        [void][int]::TryParse((Get-XmlText $node 'XResolution'), [ref]$x)
        [void][int]::TryParse((Get-XmlText $node 'YResolution'), [ref]$y)
        if ($x -gt 0 -and $x -eq $y -and $resolutions -notcontains $x) { $resolutions += $x }
    }
    $maxW = 0; $maxH = 0
    [void][int]::TryParse((Get-XmlText $platen 'MaxWidth'), [ref]$maxW)
    [void][int]::TryParse((Get-XmlText $platen 'MaxHeight'), [ref]$maxH)

    $caps = [pscustomobject]@{
        version            = Get-XmlText $xml.DocumentElement 'Version'
        makeAndModel       = Get-XmlText $xml.DocumentElement 'MakeAndModel'
        maxWidth           = $maxW
        maxHeight          = $maxH
        colorModes         = @(Get-XmlTexts $platen 'ColorMode')
        documentFormats    = @(Get-XmlTexts $platen 'DocumentFormat')
        documentFormatsExt = @(Get-XmlTexts $platen 'DocumentFormatExt')
        resolutions        = $resolutions
    }
    $EsclCapsCache[$key] = $caps
    return $caps
}

function Get-EsclStatusSummary {
    param([System.Uri]$Base)
    try {
        $res = Invoke-Http -Uri ([System.Uri]($Base.ToString() + '/ScannerStatus')) -TimeoutMs 10000
        if ($res.status -ne 200) { return '本体の状態も取得できませんでした（電源が切れていないか確認してください）' }
        $xml = New-Object System.Xml.XmlDocument
        $xml.LoadXml([System.Text.Encoding]::UTF8.GetString($res.body))
        $summary = '本体状態=' + (Get-XmlText $xml.DocumentElement 'State')
        $job = $xml.SelectSingleNode("//*[local-name()='JobInfo']")
        if ($job) {
            $summary += ', 直近ジョブ=' + (Get-XmlText $job 'JobState') + ', 生成画像=' + (Get-XmlText $job 'ImagesCompleted')
            $reasons = @(Get-XmlTexts $job 'JobStateReason')
            if ($reasons.Count -gt 0) { $summary += ' (' + ($reasons -join ',') + ')' }
        }
        return $summary
    } catch { return '本体の状態も取得できませんでした（電源が切れていないか確認してください）' }
}

# 希望条件を本体が受け付ける値へ寄せる（対応外の解像度を投げると201で受理されても
# スキャンが実行されない機種があるため）
function Resolve-EsclSettings {
    param($Caps, [int]$Dpi, [string]$ColorMode)
    $s = @{ dpi = $Dpi; width = 2480; height = 3508; colorMode = $ColorMode; format = 'image/jpeg'; useFormatExt = $false }
    if ($s.dpi -le 0) { $s.dpi = $DefaultDpi }
    if ($null -eq $Caps) { if (-not $s.colorMode) { $s.colorMode = 'RGB24' }; return $s }

    if ($Caps.resolutions.Count -gt 0) {
        $below = @($Caps.resolutions | Where-Object { $_ -le $s.dpi })
        if ($below.Count -gt 0) { $s.dpi = ($below | Measure-Object -Maximum).Maximum } else { $s.dpi = ($Caps.resolutions | Measure-Object -Minimum).Minimum }
    }
    if ($Caps.maxWidth -gt 0 -and $Caps.maxWidth -lt $s.width) { $s.width = $Caps.maxWidth }
    if ($Caps.maxHeight -gt 0 -and $Caps.maxHeight -lt $s.height) { $s.height = $Caps.maxHeight }

    if ($Caps.colorModes.Count -gt 0) {
        if ($Caps.colorModes -notcontains $s.colorMode) { if ($Caps.colorModes -contains 'RGB24') { $s.colorMode = 'RGB24' } else { $s.colorMode = $Caps.colorModes[0] } }
    } elseif (-not $s.colorMode) { $s.colorMode = 'RGB24' }

    $formats = $Caps.documentFormats
    if ($Caps.documentFormatsExt.Count -gt 0) { $s.useFormatExt = $true; $formats = $Caps.documentFormatsExt }
    if ($formats.Count -gt 0) {
        if ($formats -contains 'image/jpeg') { $s.format = 'image/jpeg' } elseif ($formats -contains 'application/pdf') { $s.format = 'application/pdf' } else { $s.format = $formats[0] }
    }
    return $s
}

function New-EsclScanSettingsXml {
    param($S)
    if ($S.useFormatExt) { $formatElement = '<scan:DocumentFormatExt>' + $S.format + '</scan:DocumentFormatExt>' } else { $formatElement = '<pwg:DocumentFormat>' + $S.format + '</pwg:DocumentFormat>' }
    return @"
<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:escl="http://schemas.hp.com/imaging/escl/2011/05/03">
  <pwg:Version>2.6</pwg:Version>
  <pwg:ScanRegions>
    <pwg:ScanRegion>
      <pwg:XOffset>0</pwg:XOffset>
      <pwg:YOffset>0</pwg:YOffset>
      <pwg:Width>$($S.width)</pwg:Width>
      <pwg:Height>$($S.height)</pwg:Height>
      <pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits>
    </pwg:ScanRegion>
  </pwg:ScanRegions>
  <pwg:InputSource>Platen</pwg:InputSource>
  $formatElement
  <scan:ColorMode>$($S.colorMode)</scan:ColorMode>
  <scan:XResolution>$($S.dpi)</scan:XResolution>
  <scan:YResolution>$($S.dpi)</scan:YResolution>
</scan:ScanSettings>
"@
}

function Invoke-EsclScan {
    param([System.Uri]$Base, [int]$Dpi, [string]$ColorMode)
    $caps = $null
    try { $caps = Get-EsclCapabilities -Base $Base } catch { $caps = $null }
    $settings = Resolve-EsclSettings -Caps $caps -Dpi $Dpi -ColorMode $ColorMode

    $body = [System.Text.Encoding]::UTF8.GetBytes((New-EsclScanSettingsXml -S $settings))
    try { $created = Invoke-Http -Uri ([System.Uri]($Base.ToString() + '/ScanJobs')) -Method 'POST' -Body $body -ContentType 'text/xml; charset=utf-8' } catch { throw ('スキャンジョブを作成できませんでした (' + $Base + '): ' + $_.Exception.Message) }
    if ($created.status -eq 409 -or $created.status -eq 503) { throw ('スキャナが使用中です (HTTP ' + $created.status + ')') }
    if ($created.status -ne 201) { throw ('スキャンジョブの作成に失敗しました (HTTP ' + $created.status + ') 要求条件: ' + $settings.dpi + 'dpi ' + $settings.colorMode + ' ' + $settings.format) }
    $location = $created.headers['Location']
    if (-not $location) { throw 'スキャンジョブのLocationヘッダーが返りませんでした' }
    $jobUri = New-Object System.Uri($Base, $location)

    try {
        $deadline = (Get-Date).AddSeconds(90)
        $docUri = [System.Uri]($jobUri.ToString().TrimEnd('/') + '/NextDocument')
        while ($true) {
            try { $res = Invoke-Http -Uri $docUri -TimeoutMs 300000 } catch { throw ('スキャン画像の取得に失敗しました: ' + $_.Exception.Message) }
            if ($res.status -eq 200) {
                if ($res.body.Length -eq 0) { throw 'スキャナから画像を取得できませんでした' }
                $ct = $res.headers['Content-Type']; if (-not $ct) { $ct = 'image/jpeg' }
                $model = ''
                if ($caps) { $model = $caps.makeAndModel }
                return @{ data = $res.body; contentType = $ct; dpi = $settings.dpi; colorMode = $settings.colorMode; makeAndModel = $model }
            }
            if ($res.status -eq 404 -or $res.status -eq 410) { throw 'スキャナから画像を取得できませんでした。原稿がセットされているか確認してください。' }
            if ($res.status -eq 503) {
                if ((Get-Date) -gt $deadline) { throw 'スキャナの準備が終わりませんでした（90秒待機）' }
                Start-Sleep -Seconds 2
                continue
            }
            throw ('スキャン画像の取得に失敗しました (HTTP ' + $res.status + ')')
        }
    } catch {
        throw ($_.Exception.Message + '（' + (Get-EsclStatusSummary -Base $Base) + '）')
    } finally {
        # ジョブを残すと次のスキャンを受け付けない機種があるため必ず削除を試みる
        try { [void](Invoke-Http -Uri $jobUri -Method 'DELETE' -TimeoutMs 10000) } catch { }
    }
}

# =============================================================================
# mDNS（mdns.js の移植）
# =============================================================================

function ConvertTo-DnsName {
    param([string]$Name)
    $bytes = New-Object System.Collections.Generic.List[byte]
    foreach ($label in ($Name -split '\.' | Where-Object { $_ })) {
        $lb = [System.Text.Encoding]::UTF8.GetBytes($label)
        $bytes.Add([byte]$lb.Length); $bytes.AddRange($lb)
    }
    $bytes.Add(0)
    return $bytes.ToArray()
}

function New-MdnsQuery {
    param([string[]]$Names)
    $out = New-Object System.Collections.Generic.List[byte]
    $out.AddRange([byte[]]@(0, 0, 0, 0, 0, [byte]$Names.Count, 0, 0, 0, 0, 0, 0))
    # PowerShellは関数の戻り値の配列を Object[] にアンロールするため、byte[] へ明示的に戻す
    foreach ($n in $Names) { $out.AddRange([byte[]](ConvertTo-DnsName $n)); $out.AddRange([byte[]]@(0, 12, 0, 1)) }
    return $out.ToArray()
}

function Read-DnsName {
    param([byte[]]$Buf, [int]$Offset)
    $labels = @(); $pos = $Offset; $jumped = $false; $end = $Offset
    while ($pos -lt $Buf.Length) {
        $len = $Buf[$pos]
        if ($len -eq 0) { if (-not $jumped) { $end = $pos + 1 }; break }
        if (($len -band 0xC0) -eq 0xC0) {
            $ptr = (($len -band 0x3F) -shl 8) -bor $Buf[$pos + 1]
            if (-not $jumped) { $end = $pos + 2 }
            $pos = $ptr; $jumped = $true; continue
        }
        $labels += [System.Text.Encoding]::UTF8.GetString($Buf, $pos + 1, $len)
        $pos += 1 + $len
        if (-not $jumped) { $end = $pos }
    }
    return @{ name = ($labels -join '.'); end = $end }
}

function Read-UInt16BE { param([byte[]]$B, [int]$O) return ([int]$B[$O] -shl 8) -bor [int]$B[$O + 1] }

function Read-MdnsMessage {
    param([byte[]]$Buf, $Collected)
    $qd = Read-UInt16BE $Buf 4
    $total = (Read-UInt16BE $Buf 6) + (Read-UInt16BE $Buf 8) + (Read-UInt16BE $Buf 10)
    $offset = 12
    for ($i = 0; $i -lt $qd; $i++) { $offset = (Read-DnsName $Buf $offset).end + 4 }
    for ($i = 0; $i -lt $total -and $offset -lt $Buf.Length; $i++) {
        $nm = Read-DnsName $Buf $offset
        $offset = $nm.end
        if ($offset + 10 -gt $Buf.Length) { break }
        $type = Read-UInt16BE $Buf $offset
        $dataLen = Read-UInt16BE $Buf ($offset + 8)
        $dataStart = $offset + 10
        $offset = $dataStart + $dataLen
        switch ($type) {
            12 { [void]$Collected.ptr.Add(@{ service = $nm.name; instance = (Read-DnsName $Buf $dataStart).name }) }
            33 { if ($dataLen -ge 6) { $Collected.srv[$nm.name] = @{ port = (Read-UInt16BE $Buf ($dataStart + 4)); host = (Read-DnsName $Buf ($dataStart + 6)).name } } }
            1  { if ($dataLen -eq 4) { $Collected.a[$nm.name] = ($Buf[$dataStart..($dataStart + 3)] -join '.') } }
            16 {
                $values = @{}; $cursor = $dataStart
                while ($cursor -lt $dataStart + $dataLen) {
                    $len = $Buf[$cursor]
                    $entry = [System.Text.Encoding]::UTF8.GetString($Buf, $cursor + 1, $len)
                    $sep = $entry.IndexOf('=')
                    if ($sep -gt 0) { $values[$entry.Substring(0, $sep).ToLowerInvariant()] = $entry.Substring($sep + 1) }
                    $cursor += 1 + $len
                }
                $Collected.txt[$nm.name] = $values
            }
        }
    }
}

function Invoke-MdnsDiscover {
    param([int]$TimeoutMs = 4000)
    $services = @('_uscan._tcp.local', '_uscans._tcp.local', '_scanner._tcp.local', '_ipp._tcp.local')
    $collected = @{ ptr = (New-Object System.Collections.ArrayList); srv = @{}; a = @{}; txt = @{} }
    $group = [System.Net.IPAddress]::Parse('224.0.0.251')
    $endpoint = New-Object System.Net.IPEndPoint($group, 5353)
    $query = [byte[]](New-MdnsQuery -Names $services)

    $udp = New-Object System.Net.Sockets.UdpClient
    $udp.ExclusiveAddressUse = $false
    $udp.Client.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::Socket, [System.Net.Sockets.SocketOptionName]::ReuseAddress, $true)
    $udp.Client.Bind((New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 5353)))
    $udp.Client.ReceiveTimeout = 300
    try {
        # 送出インターフェースを明示しないと仮想アダプタ（WSL等）から送ってLANに届かないため、IPv4の全インターフェースへ送る
        $locals = @([System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() | Where-Object { $_.OperationalStatus -eq 'Up' } | ForEach-Object { $_.GetIPProperties().UnicastAddresses } | Where-Object { $_.Address.AddressFamily -eq 'InterNetwork' -and -not [System.Net.IPAddress]::IsLoopback($_.Address) } | ForEach-Object { $_.Address })
        foreach ($addr in $locals) {
            try { $udp.JoinMulticastGroup($group, $addr) } catch { }
            try { $udp.Client.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::IP, [System.Net.Sockets.SocketOptionName]::MulticastInterface, [BitConverter]::ToInt32($addr.GetAddressBytes(), 0)) } catch { }
            [void]$udp.Send($query, $query.Length, $endpoint)
        }
        # 1回のクエリだと応答を取りこぼすことがある（起動直後や、機器が
        # スリープから復帰する途中など）。待っている間に1度だけ再送する
        $deadline = (Get-Date).AddMilliseconds($TimeoutMs)
        $resendAt = (Get-Date).AddMilliseconds([Math]::Min(1200, $TimeoutMs / 2))
        $resent = $false
        while ((Get-Date) -lt $deadline) {
            if (-not $resent -and (Get-Date) -gt $resendAt) {
                $resent = $true
                foreach ($addr in $locals) {
                    try { $udp.Client.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::IP, [System.Net.Sockets.SocketOptionName]::MulticastInterface, [BitConverter]::ToInt32($addr.GetAddressBytes(), 0)) } catch { }
                    try { [void]$udp.Send($query, $query.Length, $endpoint) } catch { }
                }
            }
            $remote = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
            try { $data = $udp.Receive([ref]$remote) } catch { continue }
            try { Read-MdnsMessage -Buf $data -Collected $collected } catch { }
        }
    } finally { $udp.Close() }

    # 同じ機器をIPアドレス（無ければホスト名）でまとめ、さらにインスタンス名で統合する
    $devices = @{}
    foreach ($entry in $collected.ptr) {
        $srv = $collected.srv[$entry.instance]
        # $host は PowerShell の予約変数（$Host）で上書きできないため別名にする
        $srvHost = $null; if ($srv) { $srvHost = $srv.host }
        $address = $null; if ($srvHost -and $collected.a.ContainsKey($srvHost)) { $address = $collected.a[$srvHost] }
        $txt = $collected.txt[$entry.instance]; if ($null -eq $txt) { $txt = @{} }
        $instanceName = ($entry.instance -split '\.')[0]
        $key = $instanceName
        if (-not $devices.ContainsKey($key)) {
            $devices[$key] = @{ name = $instanceName; model = ''; host = $srvHost; address = $address; uuid = ''; services = (New-Object System.Collections.ArrayList); escl = $null }
        }
        $d = $devices[$key]
        $label = $entry.service -replace '\.local$', ''
        if (-not $d.services.Contains($label)) { [void]$d.services.Add($label) }
        if (-not $d.model -and $txt['ty']) { $d.model = $txt['ty'] }
        if (-not $d.host -and $srvHost) { $d.host = $srvHost }
        if (-not $d.address -and $address) { $d.address = $address }
        if (-not $d.uuid -and $txt['uuid']) { $d.uuid = $txt['uuid'] }
        if ($entry.service -eq '_uscan._tcp.local' -or $entry.service -eq '_uscans._tcp.local') {
            $tls = ($entry.service -eq '_uscans._tcp.local')
            $rs = $txt['rs']; if (-not $rs) { $rs = 'eSCL' }; $rs = $rs.Trim('/')
            $port = 80; if ($tls) { $port = 443 }; if ($srv) { $port = $srv.port }
            $hostForUrl = $address; if (-not $hostForUrl) { $hostForUrl = $srvHost }
            # 平文(80)を優先する。TLSは自己署名で弾かれることが多い
            if ($hostForUrl -and ($null -eq $d.escl -or ((-not $tls) -and $d.escl.tls))) {
                $scheme = 'http'; if ($tls) { $scheme = 'https' }
                $isDefault = ($tls -and $port -eq 443) -or ((-not $tls) -and $port -eq 80)
                $authority = $hostForUrl; if (-not $isDefault) { $authority = $hostForUrl + ':' + $port }
                $d.escl = @{ url = ($scheme + '://' + $authority + '/' + $rs); port = $port; tls = $tls; resourcePath = $rs; version = [string]$txt['vers'] }
            }
        }
    }

    $results = @()
    foreach ($d in $devices.Values) {
        $idName = $d.model; if (-not $idName) { $idName = $d.name }
        $results += [pscustomobject]@{
            name          = $d.name
            model         = $d.model
            host          = $d.host
            address       = $d.address
            uuid          = $d.uuid
            services      = @($d.services)
            escl          = $d.escl
            scanSupported = ($null -ne $d.escl)
            identityKeys  = @(Get-IdentityKeys -Name $idName -Ids @([string]$d.host, [string]$d.address) -Uuid $d.uuid)
        }
    }
    return @($results | Sort-Object @{ Expression = { -not $_.scanSupported } }, @{ Expression = { $_.model + $_.name } })
}

# =============================================================================
# サーバー本体
# =============================================================================

function Handle-Request {
    param($Context)
    $req = $Context.Request
    Set-CorsHeaders -Context $Context

    $origin = $req.Headers['Origin']
    if ($origin -and -not $AllowedOrigins.Contains($origin)) {
        Write-Log ('許可されていないOriginからの要求を拒否: ' + $origin)
        Send-Json -Context $Context -Status 403 -Object @{ ok = $false; error = ('許可されていないOriginです: ' + $origin) }
        return
    }
    if ($req.HttpMethod -eq 'OPTIONS') { $Context.Response.StatusCode = 204; $Context.Response.Close(); return }

    $route = $req.Url.AbsolutePath.TrimEnd('/'); if ($route -eq '') { $route = '/' }
    $target = (Get-QueryParam $Context 'target').Trim()

    try {
        if ($route -eq '/health' -and $req.HttpMethod -eq 'GET') {
            $count = 0; $registered = 0; $err = $null
            try { $grouped = @(Get-WiaDevicesGrouped); $registered = $grouped.Count; $count = @($grouped | Where-Object { $_.present }).Count } catch { $err = $_.Exception.Message }
            Send-Json -Context $Context -Status 200 -Object @{ ok = ($null -eq $err); platform = 'win32'; source = 'wia'; runtime = 'powershell'; deviceCount = $count; registeredCount = $registered; error = $err }
            return
        }
        if ($route -eq '/devices' -and $req.HttpMethod -eq 'GET') {
            $grouped = @(Get-WiaDevicesGrouped)
            Send-Json -Context $Context -Status 200 -Object @{ ok = $true; devices = $grouped; connectedCount = @($grouped | Where-Object { $_.present }).Count; registeredCount = $grouped.Count }
            return
        }
        if ($route -eq '/discover' -and $req.HttpMethod -eq 'GET') {
            $t = 4000; [void][int]::TryParse((Get-QueryParam $Context 'timeoutMs'), [ref]$t); $t = [Math]::Min(15000, [Math]::Max(1000, $t))
            $found = @(Invoke-MdnsDiscover -TimeoutMs $t)
            Write-Log ('discover: ' + $found.Count + '台')
            Send-Json -Context $Context -Status 200 -Object @{ ok = $true; devices = $found }
            return
        }
        if ($route -eq '/escl/status' -and $req.HttpMethod -eq 'GET') {
            if (-not $target) { Send-Json -Context $Context -Status 400 -Object @{ ok = $false; error = 'target（スキャナの接続先）を指定してください' }; return }
            try {
                $base = Get-EsclBaseUri -RawTarget $target
                $caps = Get-EsclCapabilities -Base $base
                $formats = $caps.documentFormats; if ($caps.documentFormatsExt.Count -gt 0) { $formats = $caps.documentFormatsExt }
                Send-Json -Context $Context -Status 200 -Object @{ ok = $true; target = $base.ToString(); makeAndModel = $caps.makeAndModel; version = $caps.version; resolutions = $caps.resolutions; colorModes = $caps.colorModes; formats = $formats; maxWidthMm = [int][Math]::Round($caps.maxWidth / 300 * 25.4); maxHeightMm = [int][Math]::Round($caps.maxHeight / 300 * 25.4) }
            } catch {
                Send-Json -Context $Context -Status 200 -Object @{ ok = $false; target = $target; error = $_.Exception.Message }
            }
            return
        }
        # スキャンは状態を変える操作なのでPOSTだけ受け付ける
        if ($route -eq '/scan' -and $req.HttpMethod -eq 'POST') {
            $dpi = ConvertTo-Dpi (Get-QueryParam $Context 'dpi')
            if ($target) {
                Write-Log ('escl scan start (target=' + $target + ', dpi=' + $dpi + ')')
                $base = Get-EsclBaseUri -RawTarget $target
                $result = Invoke-EsclScan -Base $base -Dpi $dpi -ColorMode (Get-QueryParam $Context 'colorMode')
                Write-Log ('escl scan done (' + $result.data.Length + ' bytes, ' + $result.dpi + 'dpi)')
                Send-Bytes -Context $Context -Status 200 -ContentType $result.contentType -Body $result.data -ExtraHeaders @{
                    'X-Scan-Dpi' = $result.dpi; 'X-Scan-Color-Mode' = $result.colorMode; 'X-Scan-Target' = $base.ToString()
                    'X-Scan-Model' = [System.Uri]::EscapeDataString([string]$result.makeAndModel)
                    'Access-Control-Expose-Headers' = 'X-Scan-Dpi, X-Scan-Color-Mode, X-Scan-Target, X-Scan-Model'
                }
                return
            }
            $quality = $DefaultQuality; $q = 0
            if ([int]::TryParse((Get-QueryParam $Context 'quality'), [ref]$q)) { $quality = [Math]::Min(100, [Math]::Max(1, $q)) }
            $deviceId = Get-QueryParam $Context 'deviceId'
            $label = $deviceId; if (-not $label) { $label = 'auto' }
            Write-Log ('wia scan start (dpi=' + $dpi + ', deviceId=' + $label + ')')
            $result = Invoke-WiaScan -Dpi $dpi -Quality $quality -DeviceId $deviceId
            Write-Log ('wia scan done (' + $result.data.Length + ' bytes, ' + $result.meta.width + 'x' + $result.meta.height + ')')
            $ct = $result.meta.format; if (-not $ct) { $ct = 'image/jpeg' }
            Send-Bytes -Context $Context -Status 200 -ContentType $ct -Body $result.data -ExtraHeaders @{
                'X-Scan-Width' = $result.meta.width; 'X-Scan-Height' = $result.meta.height; 'X-Scan-Dpi' = $result.meta.dpi
                'X-Scan-Model' = [System.Uri]::EscapeDataString([string]$result.meta.device)
                'Access-Control-Expose-Headers' = 'X-Scan-Width, X-Scan-Height, X-Scan-Dpi, X-Scan-Model'
            }
            return
        }
        Send-Json -Context $Context -Status 404 -Object @{ ok = $false; error = ('Not found: ' + $req.HttpMethod + ' ' + $route) }
    } catch {
        Write-Log ('error: ' + $_.Exception.Message)
        try { Send-Json -Context $Context -Status 500 -Object @{ ok = $false; error = $_.Exception.Message } } catch { }
    }
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add('http://localhost:' + $Port + '/')
$listener.Prefixes.Add('http://127.0.0.1:' + $Port + '/')
try {
    $listener.Start()
} catch {
    Write-Log ('ポート ' + $Port + ' で待ち受けできません（他のブリッジが起動中の可能性があります）: ' + $_.Exception.Message)
    exit 1
}

Write-Log ('listening on http://localhost:' + $Port + '  (PowerShell版)')
Write-Log ('allowed origins: ' + ($AllowedOrigins -join ', '))
Write-Log ('wia script: ' + $WiaScript)
Write-Log 'endpoints: GET /health, GET /devices, GET /discover, GET /escl/status?target=, POST /scan?dpi=300[&deviceId=|&target=]'
Write-Log '終了するには Ctrl+C を押してください'

try {
    while ($listener.IsListening) {
        # GetContext() で完全にブロックすると Ctrl+C が効かないため、短く待ちながら回す
        $task = $listener.GetContextAsync()
        while (-not $task.Wait(250)) { if (-not $listener.IsListening) { break } }
        if ($task.IsCompleted -and -not $task.IsFaulted) { Handle-Request -Context $task.Result }
    }
} finally {
    $listener.Stop()
    Write-Log 'stopped'
}
