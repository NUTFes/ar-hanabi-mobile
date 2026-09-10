package infra

// eSCL（AirPrint Scan / AirScan）クライアント。
//
// ネットワーク接続されたスキャナからHTTPで画像を取得する。eSCLはHTTP + XMLだけで
// 完結するプロトコルなので、APIサーバーから直接プリンターを叩ける。
//
// 機種ごとに以下が違うため、決め打ちせず本体のScannerCapabilitiesに合わせて要求を組む。
//   - リソースパス（mDNSのTXTレコード rs= で広告される。多くは "eSCL"）
//   - 対応解像度（離散値。要求値がリストに無いと本体がジョブを実行しないことがある）
//   - 最大読み取り範囲（A4より狭い機種がある）
//   - カラーモード・出力フォーマット
//   - DocumentFormat と DocumentFormatExt のどちらを見るか
//
// USB接続の場合はコンテナからスキャナへ到達できないため、この経路は使えない。
// その場合はホスト上で動く scanner-bridge（WIA経由）を使う。

import (
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	// eSCLの座標・サイズの既定単位は1/300インチ。A4は 8.27 x 11.69 インチ
	a4WidthInThreeHundredths  = 2480
	a4HeightInThreeHundredths = 3508

	defaultScanDPI = 300

	// 既定のリソースパス。mDNSで rs= が取れる場合はそちらを使う
	defaultResourcePath = "eSCL"

	// スキャン開始直後はウォームアップ中で 503 が返る機種があるため、
	// NextDocument はしばらくリトライする
	nextDocumentRetryInterval = 2 * time.Second
	nextDocumentMaxWait       = 90 * time.Second
)

// ErrESCLNotConfigured は接続先が設定されていないことを表す。
var ErrESCLNotConfigured = errors.New("スキャナの接続先が設定されていません（環境変数 SCANNER_ESCL_URL、または target パラメータ）")

// ErrNoDocument はスキャンジョブから画像が得られなかったことを表す。
var ErrNoDocument = errors.New("スキャナから画像を取得できませんでした")

// ScanOptions はスキャンの要求条件。実際の値は本体の対応状況に合わせて調整される。
type ScanOptions struct {
	// DPI は希望する読み取り解像度。対応リストに無ければ最も近い対応値へ落とす。
	DPI int
	// ColorMode は希望するカラーモード（例 RGB24 / Grayscale8）。空なら本体の対応から選ぶ。
	ColorMode string
}

// DefaultScanOptions はA4全面・300dpi・カラーの要求を返す。
func DefaultScanOptions() ScanOptions {
	return ScanOptions{DPI: defaultScanDPI}
}

// ScannerCapabilities は ScannerCapabilities から必要な項目だけを取り出したもの。
// 名前空間プレフィックスは機種ごとに異なるため、ローカル名だけで拾っている。
type ScannerCapabilities struct {
	Version      string `xml:"Version"`
	MakeAndModel string `xml:"MakeAndModel"`
	Manufacturer string `xml:"Manufacturer"`

	MaxWidth  int `xml:"Platen>PlatenInputCaps>MaxWidth"`
	MaxHeight int `xml:"Platen>PlatenInputCaps>MaxHeight"`

	ColorModes         []string `xml:"Platen>PlatenInputCaps>SettingProfiles>SettingProfile>ColorModes>ColorMode"`
	DocumentFormats    []string `xml:"Platen>PlatenInputCaps>SettingProfiles>SettingProfile>DocumentFormats>DocumentFormat"`
	DocumentFormatsExt []string `xml:"Platen>PlatenInputCaps>SettingProfiles>SettingProfile>DocumentFormats>DocumentFormatExt"`

	DiscreteResolutions []struct {
		X int `xml:"XResolution"`
		Y int `xml:"YResolution"`
	} `xml:"Platen>PlatenInputCaps>SettingProfiles>SettingProfile>SupportedResolutions>DiscreteResolutions>DiscreteResolution"`
}

// SupportedDPIs は縦横が同じ対応解像度を昇順に近い形で返す（本体の申告順のまま）。
func (c *ScannerCapabilities) SupportedDPIs() []int {
	dpis := make([]int, 0, len(c.DiscreteResolutions))
	for _, resolution := range c.DiscreteResolutions {
		if resolution.X > 0 && resolution.X == resolution.Y {
			dpis = append(dpis, resolution.X)
		}
	}
	return dpis
}

// ScannerStatus は ScannerStatus から必要な項目だけを取り出したもの。
// スキャンが失敗したときに、本体が何を報告しているかを操作者へ伝えるために使う。
type ScannerStatus struct {
	State string `xml:"State"`
	Jobs  []struct {
		JobState        string   `xml:"JobState"`
		JobStateReasons []string `xml:"JobStateReasons>JobStateReason"`
		ImagesCompleted int      `xml:"ImagesCompleted"`
	} `xml:"Jobs>JobInfo"`
}

// ScanResult はスキャンで得られた画像と、実際に使われた条件。
type ScanResult struct {
	Data        []byte
	ContentType string
	// 実際に本体へ要求した値（希望値と異なることがあるため呼び出し側へ返す）
	DPI          int
	ColorMode    string
	MakeAndModel string
}

// ESCLClient は1台のスキャナに対するeSCLクライアント。
type ESCLClient struct {
	baseURL    *url.URL // リソースパスまで含む（例 http://192.168.1.5/eSCL）
	httpClient *http.Client

	capsMutex sync.Mutex
	caps      *ScannerCapabilities
}

// NewESCLClient は接続先からクライアントを作る。
//
// 受け付ける形式:
//
//	http://192.168.1.5            → http://192.168.1.5/eSCL を使う
//	http://192.168.1.5/eSCL       → そのまま使う
//	http://192.168.1.5:8080/Scan  → 独自のポート・パスにも対応
func NewESCLClient(rawTarget string) (*ESCLClient, error) {
	trimmed := strings.TrimSpace(rawTarget)
	if trimmed == "" {
		return nil, ErrESCLNotConfigured
	}

	// スキーム無しで書かれても許容する（当日IPだけ入力されることを想定）
	if !strings.Contains(trimmed, "://") {
		trimmed = "http://" + trimmed
	}

	parsed, err := url.Parse(strings.TrimRight(trimmed, "/"))
	if err != nil {
		return nil, fmt.Errorf("スキャナの接続先URLが不正です: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("スキャナの接続先URLはhttpまたはhttpsで指定してください: %s", rawTarget)
	}
	if parsed.Host == "" {
		return nil, fmt.Errorf("スキャナの接続先URLにホストが含まれていません: %s", rawTarget)
	}
	if err := validateScannerHost(parsed.Hostname()); err != nil {
		return nil, err
	}
	if parsed.Path == "" {
		parsed.Path = "/" + defaultResourcePath
	}

	return &ESCLClient{
		baseURL: parsed,
		// 高解像度スキャンは1分以上かかることがあるため長めに取る
		httpClient: &http.Client{Timeout: 5 * time.Minute},
	}, nil
}

// validateScannerHost は、管理画面から任意のURLを渡せる仕様に対する歯止め。
// スキャナは同一LAN上にいる前提なので、プライベートアドレスと .local 名だけ許可し、
// APIサーバーを踏み台に外部へリクエストを飛ばせないようにする。
func validateScannerHost(host string) error {
	if host == "" {
		return errors.New("スキャナのホスト名が空です")
	}

	if ip := net.ParseIP(host); ip != nil {
		// link-local（169.254.x.x）は許可しない。クラウド環境ではメタデータAPI
		// （169.254.169.254）のアドレスで、そこへ到達させると認証情報が漏れる
		if ip.IsLoopback() || ip.IsPrivate() {
			return nil
		}
		return fmt.Errorf("スキャナの接続先はプライベートIPアドレスのみ指定できます: %s", host)
	}

	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".local") {
		return nil
	}
	return fmt.Errorf("スキャナの接続先はプライベートIPアドレスか .local 名で指定してください: %s", host)
}

// Target は設定されている接続先を返す（状態表示・選択用のキーとして使う）。
func (c *ESCLClient) Target() string {
	return c.baseURL.String()
}

func (c *ESCLClient) endpoint(suffix string) string {
	return c.baseURL.String() + suffix
}

// Capabilities はスキャナの機能情報を取得する。到達確認にも使う。
// 一度取得したら使い回す（スキャンごとに問い合わせると余計に遅くなるため）。
func (c *ESCLClient) Capabilities(ctx context.Context) (*ScannerCapabilities, error) {
	c.capsMutex.Lock()
	cached := c.caps
	c.capsMutex.Unlock()
	if cached != nil {
		return cached, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint("/ScannerCapabilities"), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("スキャナに接続できませんでした (%s): %w", c.Target(), err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		io.Copy(io.Discard, resp.Body)
		return nil, fmt.Errorf(
			"ScannerCapabilities が %s を返しました（この機種はeSCL非対応か、リソースパスが違う可能性があります）",
			resp.Status,
		)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("ScannerCapabilities の読み込みに失敗しました: %w", err)
	}

	capabilities := &ScannerCapabilities{}
	if err := xml.Unmarshal(body, capabilities); err != nil {
		return nil, fmt.Errorf("ScannerCapabilities の解析に失敗しました: %w", err)
	}

	c.capsMutex.Lock()
	c.caps = capabilities
	c.capsMutex.Unlock()

	return capabilities, nil
}

// Status は本体の状態と直近ジョブの状態を取得する。
func (c *ESCLClient) Status(ctx context.Context) (*ScannerStatus, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.endpoint("/ScannerStatus"), nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("スキャナの状態を取得できませんでした: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		io.Copy(io.Discard, resp.Body)
		return nil, fmt.Errorf("ScannerStatus が %s を返しました", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("ScannerStatus の読み込みに失敗しました: %w", err)
	}

	status := &ScannerStatus{}
	if err := xml.Unmarshal(body, status); err != nil {
		return nil, fmt.Errorf("ScannerStatus の解析に失敗しました: %w", err)
	}
	return status, nil
}

// statusSummary はエラーメッセージに添える本体状態の要約を返す。
func (c *ESCLClient) statusSummary() string {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	status, err := c.Status(ctx)
	if err != nil {
		return "本体の状態も取得できませんでした（電源が切れていないか確認してください）"
	}

	summary := "本体状態=" + status.State
	if len(status.Jobs) > 0 {
		// 直近のジョブが先頭に来る
		job := status.Jobs[0]
		summary += fmt.Sprintf(", 直近ジョブ=%s, 生成画像=%d", job.JobState, job.ImagesCompleted)
		if len(job.JobStateReasons) > 0 {
			summary += " (" + strings.Join(job.JobStateReasons, ",") + ")"
		}
	}
	return summary
}

// resolvedSettings は本体の対応状況に合わせて確定したスキャン条件。
type resolvedSettings struct {
	dpi          int
	width        int
	height       int
	colorMode    string
	format       string
	useFormatExt bool
}

// resolveSettings は希望条件を本体が受け付ける値へ寄せる。
// 対応外の解像度やA4より大きい範囲を投げると、ジョブは201で受理されるのに
// スキャンが実行されない（画像0枚でAbortされる）機種があるため。
func resolveSettings(caps *ScannerCapabilities, options ScanOptions) resolvedSettings {
	settings := resolvedSettings{
		dpi:       options.DPI,
		width:     a4WidthInThreeHundredths,
		height:    a4HeightInThreeHundredths,
		colorMode: options.ColorMode,
		format:    "image/jpeg",
	}
	if settings.dpi <= 0 {
		settings.dpi = defaultScanDPI
	}

	if caps == nil {
		return settings
	}

	// 解像度: 希望値以下で最大の対応値。無ければ最小の対応値
	if dpis := caps.SupportedDPIs(); len(dpis) > 0 {
		best := 0
		smallest := dpis[0]
		for _, dpi := range dpis {
			if dpi <= settings.dpi && dpi > best {
				best = dpi
			}
			if dpi < smallest {
				smallest = dpi
			}
		}
		if best > 0 {
			settings.dpi = best
		} else {
			settings.dpi = smallest
		}
	}

	// 読み取り範囲: 本体の最大値でクランプ（A4より小さい原稿台の機種がある）
	if caps.MaxWidth > 0 && caps.MaxWidth < settings.width {
		settings.width = caps.MaxWidth
	}
	if caps.MaxHeight > 0 && caps.MaxHeight < settings.height {
		settings.height = caps.MaxHeight
	}

	// カラーモード: 希望値が対応リストに無ければ RGB24 を、それも無ければ先頭を使う
	if len(caps.ColorModes) > 0 {
		if !containsString(caps.ColorModes, settings.colorMode) {
			if containsString(caps.ColorModes, "RGB24") {
				settings.colorMode = "RGB24"
			} else {
				settings.colorMode = caps.ColorModes[0]
			}
		}
	} else if settings.colorMode == "" {
		settings.colorMode = "RGB24"
	}

	// 出力フォーマット: JPEGを優先し、無ければPDF、それも無ければ申告の先頭
	formats := caps.DocumentFormats
	if len(caps.DocumentFormatsExt) > 0 {
		// DocumentFormatExt を申告する機種は、要求側もそちらを使う（eSCL 2.5以降）
		settings.useFormatExt = true
		formats = caps.DocumentFormatsExt
	}
	if len(formats) > 0 {
		switch {
		case containsString(formats, "image/jpeg"):
			settings.format = "image/jpeg"
		case containsString(formats, "application/pdf"):
			settings.format = "application/pdf"
		default:
			settings.format = formats[0]
		}
	}

	return settings
}

func containsString(values []string, target string) bool {
	if target == "" {
		return false
	}
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

// ScanSettings のXML。encoding/xml は名前空間プレフィックスの出力を制御できないため、
// eSCLが要求する pwg / scan プレフィックス付きの文書はテンプレートから組み立てる。
const scanSettingsTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<scan:ScanSettings xmlns:pwg="http://www.pwg.org/schemas/2010/12/sm" xmlns:scan="http://schemas.hp.com/imaging/escl/2011/05/03" xmlns:escl="http://schemas.hp.com/imaging/escl/2011/05/03">
  <pwg:Version>2.6</pwg:Version>
  <pwg:ScanRegions>
    <pwg:ScanRegion>
      <pwg:XOffset>0</pwg:XOffset>
      <pwg:YOffset>0</pwg:YOffset>
      <pwg:Width>%d</pwg:Width>
      <pwg:Height>%d</pwg:Height>
      <pwg:ContentRegionUnits>escl:ThreeHundredthsOfInches</pwg:ContentRegionUnits>
    </pwg:ScanRegion>
  </pwg:ScanRegions>
  <pwg:InputSource>Platen</pwg:InputSource>
  %s
  <scan:ColorMode>%s</scan:ColorMode>
  <scan:XResolution>%d</scan:XResolution>
  <scan:YResolution>%d</scan:YResolution>
</scan:ScanSettings>`

func buildScanSettings(settings resolvedSettings) string {
	formatElement := fmt.Sprintf("<pwg:DocumentFormat>%s</pwg:DocumentFormat>", settings.format)
	if settings.useFormatExt {
		formatElement = fmt.Sprintf("<scan:DocumentFormatExt>%s</scan:DocumentFormatExt>", settings.format)
	}
	return fmt.Sprintf(
		scanSettingsTemplate,
		settings.width,
		settings.height,
		formatElement,
		settings.colorMode,
		settings.dpi,
		settings.dpi,
	)
}

// Scan はスキャンジョブを作成し、1ページ目の画像を取得する。
func (c *ESCLClient) Scan(ctx context.Context, options ScanOptions) (*ScanResult, error) {
	// 対応状況が取れない機種でも動くよう、失敗しても既定値で続行する
	capabilities, capsErr := c.Capabilities(ctx)
	if capsErr != nil {
		capabilities = nil
	}
	settings := resolveSettings(capabilities, options)

	jobURL, err := c.createScanJob(ctx, settings)
	if err != nil {
		return nil, err
	}
	// ジョブを残すと次のスキャンを受け付けない機種があるため、取得後は必ず削除を試みる。
	// 呼び出し側のctxが終了していても削除したいので、独立したctxを使う。
	defer func() {
		cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		c.deleteScanJob(cleanupCtx, jobURL)
	}()

	result, err := c.fetchNextDocument(ctx, jobURL)
	if err != nil {
		// ジョブは受理されたのにスキャンが行われない（本体側でキャンセルされる、
		// 転送が途中で切れる）ことがあるため、本体が何を報告しているかを添える
		if summary := c.statusSummary(); summary != "" {
			return nil, fmt.Errorf("%w（%s）", err, summary)
		}
		return nil, err
	}

	result.DPI = settings.dpi
	result.ColorMode = settings.colorMode
	if capabilities != nil {
		result.MakeAndModel = capabilities.MakeAndModel
	}
	return result, nil
}

func (c *ESCLClient) createScanJob(ctx context.Context, settings resolvedSettings) (string, error) {
	body := buildScanSettings(settings)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.endpoint("/ScanJobs"),
		strings.NewReader(body),
	)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "text/xml; charset=utf-8")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("スキャンジョブを作成できませんでした (%s): %w", c.Target(), err)
	}
	defer resp.Body.Close()
	// 接続を再利用できるよう本文は読み切る
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode == http.StatusConflict || resp.StatusCode == http.StatusServiceUnavailable {
		return "", fmt.Errorf("スキャナが使用中です (%s)", resp.Status)
	}
	if resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf(
			"スキャンジョブの作成に失敗しました (%s) 要求条件: %ddpi %s %s",
			resp.Status, settings.dpi, settings.colorMode, settings.format,
		)
	}

	location := resp.Header.Get("Location")
	if location == "" {
		return "", errors.New("スキャンジョブのLocationヘッダーが返りませんでした")
	}

	// Locationは相対パスで返る機種もあるためベースURLで解決する
	locationURL, err := url.Parse(location)
	if err != nil {
		return "", fmt.Errorf("スキャンジョブのLocationが不正です (%s): %w", location, err)
	}
	return c.baseURL.ResolveReference(locationURL).String(), nil
}

func (c *ESCLClient) fetchNextDocument(ctx context.Context, jobURL string) (*ScanResult, error) {
	deadline := time.Now().Add(nextDocumentMaxWait)

	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, jobURL+"/NextDocument", nil)
		if err != nil {
			return nil, err
		}

		resp, err := c.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("スキャン画像の取得に失敗しました: %w", err)
		}

		switch resp.StatusCode {
		case http.StatusOK:
			data, readErr := io.ReadAll(resp.Body)
			resp.Body.Close()
			if readErr != nil {
				// 本体がスキャンを開始できないまま接続を閉じるとここに来る
				return nil, fmt.Errorf(
					"スキャン画像の転送が途中で切れました（%d バイト受信）: %w",
					len(data), readErr,
				)
			}
			if len(data) == 0 {
				return nil, ErrNoDocument
			}

			contentType := resp.Header.Get("Content-Type")
			if contentType == "" {
				contentType = "image/jpeg"
			}
			return &ScanResult{Data: data, ContentType: contentType}, nil

		case http.StatusNotFound, http.StatusGone:
			// これ以上ページが無い状態。1ページ目で来た場合はスキャン失敗
			resp.Body.Close()
			return nil, ErrNoDocument

		case http.StatusServiceUnavailable:
			// ウォームアップ中。少し待って再試行する
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()

			if time.Now().After(deadline) {
				return nil, fmt.Errorf("スキャナの準備が終わりませんでした（%s待機）", nextDocumentMaxWait)
			}

			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(nextDocumentRetryInterval):
			}

		default:
			status := resp.Status
			io.Copy(io.Discard, resp.Body)
			resp.Body.Close()
			return nil, fmt.Errorf("スキャン画像の取得に失敗しました (%s)", status)
		}
	}
}

// deleteScanJob はジョブの後片付け。失敗しても致命的ではないため戻り値は返さない。
func (c *ESCLClient) deleteScanJob(ctx context.Context, jobURL string) {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, jobURL, nil)
	if err != nil {
		return
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return
	}
	io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
}
