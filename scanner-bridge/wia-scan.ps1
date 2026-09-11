<#
.SYNOPSIS
    WIA (Windows Image Acquisition) 経由でスキャナから画像を取得する。

.DESCRIPTION
    ブラウザからスキャナを直接操作するAPIは存在しないため、USB接続のプリンターで
    スキャンする場合は、ホスト上で動く scanner-bridge (server.js) がこのスクリプトを
    呼び出して実行する。ネットワーク接続の場合はAPIサーバー側のeSCL実装
    (api/infra/escl.go) を使うため、このスクリプトは通らない。

    stdoutにはJSONだけを出力する（server.js がパースする）。警告は stderr へ送る。

.PARAMETER List
    利用可能なWIAデバイスの一覧をJSONで出力して終了する。

.PARAMETER Out
    スキャン結果の保存先パス。-List を指定しない場合は必須。

.PARAMETER Dpi
    読み取り解像度。既定300。

.PARAMETER DeviceId
    使用するWIAデバイスのDeviceID。省略時は自動選択する。

.PARAMETER PaperWidthInch
    読み取り幅（インチ）。既定はA4の8.27。

.PARAMETER PaperHeightInch
    読み取り高さ（インチ）。既定はA4の11.69。

.PARAMETER Quality
    JPEGの品質（1〜100）。既定85。BMPからの変換時にのみ使う。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File wia-scan.ps1 -List
    powershell -ExecutionPolicy Bypass -File wia-scan.ps1 -Out C:\tmp\scan.jpg -Dpi 300
#>
param(
    [switch]$List,
    [string]$Out,
    [int]$Dpi = 300,
    [string]$DeviceId = '',
    [double]$PaperWidthInch = 8.27,
    [double]$PaperHeightInch = 11.69,
    [ValidateRange(1, 100)]
    [int]$Quality = 85
)

$ErrorActionPreference = 'Stop'

# stdoutにはJSONだけを流す必要がある。Write-Warning は呼び出し方によって
# stdoutへ出てしまい（"WARNING: ..." の行が混ざる）、JSONの解釈を壊すため、
# 警告は必ずstderrへ直接書く。
function Write-Diagnostic {
    param([Parameter(Mandatory = $true)] [string]$Message)
    [Console]::Error.WriteLine('WARNING: ' + $Message)
}

# WIA 1.0 のプロパティID。名前ではなくIDで指定する必要がある
$WIA_IPS_XRES = 6147
$WIA_IPS_YRES = 6148
$WIA_IPS_XPOS = 6149
$WIA_IPS_YPOS = 6150
$WIA_IPS_XEXTENT = 6151
$WIA_IPS_YEXTENT = 6152

$WIA_FORMAT_JPEG = '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}'

# WIAのデバイス種別。1 = スキャナ
$WIA_DEVICE_TYPE_SCANNER = 1

# WIAは「過去に接続したことがある機器」の登録をWindowsが保持し続けるため、
# 今つながっていないプリンターまで列挙する。PnPデバイスの実在フラグ(Present)と
# 突き合わせて、実際に接続されているものだけを判別できるようにする。
function Get-PresentImageDevices {
    $result = [pscustomobject]@{
        Available   = $false
        Names       = @{}
        InstanceIds = @{}
    }

    try {
        $devices = Get-PnpDevice -Class Image -ErrorAction Stop
        $result.Available = $true
        foreach ($device in $devices) {
            if (-not $device.Present) { continue }
            $name = ([string]$device.FriendlyName).ToLowerInvariant()
            $instanceId = ([string]$device.InstanceId).ToLowerInvariant()
            if ($name -ne '') { $result.Names[$name] = $true }
            if ($instanceId -ne '') { $result.InstanceIds[$instanceId] = $true }
        }
    } catch {
        # 実在確認ができない環境では、隠してしまわないよう全て接続中として扱う
        Write-Diagnostic ("PnPデバイスの実在確認ができませんでした（全て接続中として扱います）: " + $_.Exception.Message)
    }

    return $result
}

function Get-WiaDeviceList {
    $presence = Get-PresentImageDevices

    $manager = New-Object -ComObject WIA.DeviceManager
    $devices = @()
    foreach ($info in $manager.DeviceInfos) {
        $name = ''
        $port = ''
        $manufacturer = ''
        foreach ($property in $info.Properties) {
            if ($property.Name -eq 'Name') { $name = [string]$property.Value }
            if ($property.Name -eq 'Port') { $port = [string]$property.Value }
            if ($property.Name -eq 'Manufacturer') { $manufacturer = [string]$property.Value }
        }

        $deviceId = [string]$info.DeviceID

        # 同じプリンターがメーカー純正ドライバーとMicrosoftのクラスドライバーの
        # 両方で登録されることがある。どちらの登録かを呼び出し側へ伝える
        $driverKind = 'vendor'
        if ($manufacturer -eq 'Microsoft') {
            $driverKind = 'class'
        }

        # WIAの登録はUSB接続とネットワーク接続の両方があり得る。
        # プリンターがWi-Fiに繋がると、WindowsがWSDとeSCLのスキャン機能を
        # それぞれ別デバイスとして登録するため、同じ1台が複数件に見える。
        $connection = 'unknown'
        if ($port -match 'Usbscan' -or $deviceId -match 'ESCLUSB' -or $port -match 'ESCLUSB') {
            $connection = 'usb'
        } elseif ($port -match 'urn:uuid:' -or $port -match '^SWD\\Escl' -or $port -match '^WSD') {
            $connection = 'network'
        }

        # WIAのDeviceIDがPnPのInstanceIdと一致すればそれで判定し、
        # 一致しない登録（純正WIAドライバー等）は同名のPnPデバイスの実在で判定する
        $isPresent = $true
        if ($presence.Available) {
            $isPresent = $presence.InstanceIds.ContainsKey($deviceId.ToLowerInvariant()) -or
                         $presence.Names.ContainsKey($name.ToLowerInvariant())
        }

        $devices += [pscustomobject]@{
            deviceId     = $deviceId
            name         = $name
            port         = $port
            manufacturer = $manufacturer
            type         = [int]$info.Type
            driverKind   = $driverKind
            connection   = $connection
            present      = [bool]$isPresent
        }
    }
    return $devices
}

# 同じ複合機がメーカー純正ドライバーとMicrosoftのeSCL-USBクラスドライバーの
# 両方で二重に見えることがある。純正側は Type=1（スキャナ）で申告されるため、
# そちらを優先して選ぶ（クラスドライバー側は Type が未定義値になりやすい）。
# 未接続の登録（過去に接続したプリンターの残骸）は最後に回す。
function Select-WiaDevice {
    param(
        [Parameter(Mandatory = $true)] $Devices,
        [string]$RequestedId
    )

    if ($RequestedId -ne '') {
        foreach ($device in $Devices) {
            if ($device.deviceId -eq $RequestedId) {
                if (-not $device.present) {
                    throw ("指定されたスキャナ「" + $device.name + "」は接続されていません。" +
                           "USBケーブルと電源を確認してください（Windowsには過去の接続設定が残るため、" +
                           "未接続でも一覧に出ることがあります）。")
                }
                return $device
            }
        }
        throw "指定されたWIAデバイスが見つかりません: $RequestedId"
    }

    $connected = @($Devices | Where-Object { $_.present })
    if ($connected.Count -eq 0) {
        if ($Devices.Count -gt 0) {
            throw ('スキャナは登録されていますが、どれも接続されていません（' +
                   (($Devices | ForEach-Object { $_.name }) -join ', ') +
                   '）。USBケーブルと電源を確認してください。')
        }
        throw 'WIAデバイスが見つかりません。プリンターの電源とUSB接続、スキャナードライバーを確認してください。'
    }

    foreach ($device in $connected) {
        if ($device.type -eq $WIA_DEVICE_TYPE_SCANNER) { return $device }
    }
    return $connected[0]
}

function Set-WiaItemProperty {
    param(
        [Parameter(Mandatory = $true)] $Item,
        [Parameter(Mandatory = $true)] [int]$PropertyId,
        [Parameter(Mandatory = $true)] $Value
    )

    # 解像度や読み取り範囲を受け付けないドライバーもあるため、
    # 個別に失敗を許容して既定値のままスキャンを続行する
    try {
        $Item.Properties.Item([string]$PropertyId).Value = $Value
    } catch {
        Write-Diagnostic ("WIAプロパティ " + $PropertyId + " を設定できませんでした（既定値で続行します）: " + $_.Exception.Message)
    }
}

function Save-WiaImage {
    param(
        [Parameter(Mandatory = $true)] $Image,
        [Parameter(Mandatory = $true)] [string]$Path
    )

    # WIAのSaveFileは既存ファイルを上書きせず例外になるため、先に削除する
    if (Test-Path $Path) {
        Remove-Item $Path -Force
    }
    $Image.SaveFile($Path)
}

# WIAにもConvertフィルターがあるが、PowerShellからFormatIDを設定すると
# 「Specified cast is not valid」で失敗するため、System.Drawingで変換する。
function Convert-ToJpeg {
    param(
        [Parameter(Mandatory = $true)] [string]$SourcePath,
        [Parameter(Mandatory = $true)] [string]$DestinationPath,
        [Parameter(Mandatory = $true)] [int]$JpegQuality
    )

    Add-Type -AssemblyName System.Drawing

    $encoder = $null
    foreach ($candidate in [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders()) {
        if ($candidate.MimeType -eq 'image/jpeg') { $encoder = $candidate }
    }
    if ($null -eq $encoder) {
        throw 'JPEGエンコーダーが見つかりませんでした。'
    }

    $bitmap = $null
    $encoderParameters = $null
    try {
        $bitmap = New-Object System.Drawing.Bitmap $SourcePath
        $encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters 1
        $encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter -ArgumentList @(
            [System.Drawing.Imaging.Encoder]::Quality,
            [int64]$JpegQuality
        )

        if (Test-Path $DestinationPath) {
            Remove-Item $DestinationPath -Force
        }
        $bitmap.Save($DestinationPath, $encoder, $encoderParameters)
    } finally {
        if ($null -ne $encoderParameters) { $encoderParameters.Dispose() }
        if ($null -ne $bitmap) { $bitmap.Dispose() }
    }
}

$devices = Get-WiaDeviceList

if ($List) {
    # 1件のときも配列としてJSON化されるよう -InputObject で渡す
    ConvertTo-Json -InputObject @($devices) -Compress -Depth 4
    exit 0
}

if ([string]::IsNullOrWhiteSpace($Out)) {
    throw '-Out（保存先パス）は必須です。'
}

$selected = Select-WiaDevice -Devices $devices -RequestedId $DeviceId

$manager = New-Object -ComObject WIA.DeviceManager
$deviceInfo = $null
foreach ($info in $manager.DeviceInfos) {
    if ([string]$info.DeviceID -eq $selected.deviceId) { $deviceInfo = $info }
}
if ($null -eq $deviceInfo) {
    throw ("WIAデバイスに接続できません: " + $selected.deviceId)
}

$device = $deviceInfo.Connect()
$item = $device.Items.Item(1)

# 解像度を変えると読み取り範囲（extent）の単位も変わるため、
# DPI → 原点 → 範囲 の順に、DPIから算出したピクセル数で指定する
Set-WiaItemProperty -Item $item -PropertyId $WIA_IPS_XRES -Value $Dpi
Set-WiaItemProperty -Item $item -PropertyId $WIA_IPS_YRES -Value $Dpi
Set-WiaItemProperty -Item $item -PropertyId $WIA_IPS_XPOS -Value 0
Set-WiaItemProperty -Item $item -PropertyId $WIA_IPS_YPOS -Value 0
Set-WiaItemProperty -Item $item -PropertyId $WIA_IPS_XEXTENT -Value ([int][math]::Round($PaperWidthInch * $Dpi))
Set-WiaItemProperty -Item $item -PropertyId $WIA_IPS_YEXTENT -Value ([int][math]::Round($PaperHeightInch * $Dpi))

# JPEGでの転送を要求するが、対応していないドライバーは指定を黙って無視し、
# 既定のBMPを返す（Canon TS8330の純正WIAドライバーはBMPのみ対応）。
# A4/300dpiのBMPは26MB前後になりブラウザへ渡すには大きすぎるため、JPEGへ変換する。
$image = $item.Transfer($WIA_FORMAT_JPEG)

$outDirectory = Split-Path -Parent $Out
if ($outDirectory -ne '' -and -not (Test-Path $outDirectory)) {
    New-Item -ItemType Directory -Force -Path $outDirectory | Out-Null
}

$transferredFormat = [string]$image.FormatID
$wasConverted = $false

if ($transferredFormat -eq $WIA_FORMAT_JPEG) {
    Save-WiaImage -Image $image -Path $Out
} else {
    $tempPath = [System.IO.Path]::Combine(
        [System.IO.Path]::GetTempPath(),
        'wia-scan-' + [System.Guid]::NewGuid().ToString() + '.' + [string]$image.FileExtension
    )
    try {
        Save-WiaImage -Image $image -Path $tempPath
        Convert-ToJpeg -SourcePath $tempPath -DestinationPath $Out -JpegQuality $Quality
        $wasConverted = $true
    } finally {
        if (Test-Path $tempPath) {
            Remove-Item $tempPath -Force
        }
    }
}

$result = [pscustomobject]@{
    ok             = $true
    path           = $Out
    format         = 'image/jpeg'
    width          = [int]$image.Width
    height         = [int]$image.Height
    dpi            = $Dpi
    bytes          = [int](Get-Item $Out).Length
    deviceId       = $selected.deviceId
    device         = $selected.name
    # 診断用：ドライバーが実際に返した形式と、JPEGへ変換したかどうか
    sourceFormat   = $transferredFormat
    convertedToJpeg = $wasConverted
}
ConvertTo-Json -InputObject $result -Compress -Depth 4
