package handler

// スキャン用のハンドラー。
//
// このハンドラーのルートは oapi-codegen で生成された openapi.RegisterHandlers ではなく、
// main.go から RegisterRoutes で直接Echoへ登録する。花火のCRUDと違い、
// スキャンは外部デバイスとの入出力で、生成対象のServerInterfaceに含めると
// fireworkHandler 側に実装を強制してしまうため、意図的に生成の外に置いている。
//
// 会場では複数のスキャナが同じLANに繋がる想定のため、
//   - 環境変数 SCANNER_ESCL_URL にカンマ区切りで複数台を設定できる
//   - リクエストの target パラメータで1回ごとに宛先を指定できる（管理画面から選択する）
// の両方を受け付ける。
//
// ただし本番ではAPIはクラウド側で動き、会場のLANには届かないため、eSCLの読み取りは
// 会場のPC上の scanner-bridge が行う（scanner-bridge/escl.js）。この経路は
// 全部が同一LANにある開発時のためのもの。認証の無いAPIから任意のアドレスへ
// リクエストを飛ばせる入口（SSRF）にならないよう、target は
//   - SCANNER_ESCL_URL に設定済みの接続先、または
//   - SCANNER_ESCL_ALLOW_ANY_TARGET=true のとき、同一LAN上のプライベートアドレス
// に限定する。本番では後者を設定しない。

import (
	"errors"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"

	"github.com/labstack/echo/v4"

	"workshop-api/infra"
)

const (
	minScanDPI = 75
	maxScanDPI = 1200
)

type ScanHandler interface {
	RegisterRoutes(e *echo.Echo)
	ListScanners(ctx echo.Context) error
	GetScanStatus(ctx echo.Context) error
	Scan(ctx echo.Context) error
}

type scanHandler struct {
	// configuredTargets は環境変数で与えられた既定の接続先（複数可）
	configuredTargets []string
	// allowAnyTarget が false のとき、target は configuredTargets の中からしか選べない
	allowAnyTarget bool

	// clients は接続先ごとのクライアント。ScannerCapabilitiesを使い回すため保持する
	clientsMutex sync.Mutex
	clients      map[string]*infra.ESCLClient
}

// NewScanHandler は環境変数 SCANNER_ESCL_URL（カンマ区切りで複数可）からハンドラーを作る。
// 未設定でもエラーにはせず、スキャン要求時に「未設定」として応答する
// （本番ではこの経路を使わず、会場のPC上の scanner-bridge がeSCLを担当するため）。
// allowAnyTarget は開発時のみ true にする（設定外のLANアドレスを target で指定できる）。
func NewScanHandler(configuredTargets string, allowAnyTarget bool) ScanHandler {
	targets := make([]string, 0, 2)
	for _, candidate := range strings.Split(configuredTargets, ",") {
		trimmed := strings.TrimSpace(candidate)
		if trimmed != "" {
			targets = append(targets, trimmed)
		}
	}

	return &scanHandler{
		configuredTargets: targets,
		allowAnyTarget:    allowAnyTarget,
		clients:           make(map[string]*infra.ESCLClient),
	}
}

func (h *scanHandler) RegisterRoutes(e *echo.Echo) {
	e.GET("/scanners", h.ListScanners)
	e.GET("/scan/status", h.GetScanStatus)
	// スキャンは状態を変える操作なのでPOSTだけ受け付ける（リンクや<img>で起動されないように）
	e.POST("/scan", h.Scan)
}

// isConfiguredTarget は target が設定済みの接続先（正規化前後どちらの表記でも）かを返す。
func (h *scanHandler) isConfiguredTarget(target string) bool {
	for _, configured := range h.configuredTargets {
		if configured == target {
			return true
		}
		// "http://host" と "http://host/eSCL" のような表記差を吸収する
		if client, err := infra.NewESCLClient(configured); err == nil {
			if requested, err := infra.NewESCLClient(target); err == nil && client.Target() == requested.Target() {
				return true
			}
		}
	}
	return false
}

// ErrTargetNotAllowed は設定外の接続先が指定されたことを表す。
var ErrTargetNotAllowed = errors.New(
	"この接続先は許可されていません（本番ではLAN上のスキャナは会場PCの scanner-bridge が読み取ります。" +
		"開発時にAPI経由で任意のアドレスを使うには SCANNER_ESCL_ALLOW_ANY_TARGET=true を設定してください）",
)

// client は接続先ごとのクライアントを取得（無ければ作成）する。
func (h *scanHandler) client(target string) (*infra.ESCLClient, error) {
	h.clientsMutex.Lock()
	defer h.clientsMutex.Unlock()

	if existing, ok := h.clients[target]; ok {
		return existing, nil
	}

	created, err := infra.NewESCLClient(target)
	if err != nil {
		return nil, err
	}
	// 正規化後のURLをキーにして、同じ機器で重複した状態を持たないようにする
	if existing, ok := h.clients[created.Target()]; ok {
		h.clients[target] = existing
		return existing, nil
	}
	h.clients[target] = created
	h.clients[created.Target()] = created
	return created, nil
}

// resolveTarget はリクエストの target、無ければ設定済みの1台目を返す。
// 設定外の target は allowAnyTarget のときだけ受け付ける。
func (h *scanHandler) resolveTarget(ctx echo.Context) (string, error) {
	if requested := strings.TrimSpace(ctx.QueryParam("target")); requested != "" {
		if !h.allowAnyTarget && !h.isConfiguredTarget(requested) {
			return "", ErrTargetNotAllowed
		}
		return requested, nil
	}
	if len(h.configuredTargets) > 0 {
		return h.configuredTargets[0], nil
	}
	return "", infra.ErrESCLNotConfigured
}

type scannerInfo struct {
	Target       string   `json:"target"`
	Available    bool     `json:"available"`
	Configured   bool     `json:"configured"`
	MakeAndModel string   `json:"makeAndModel,omitempty"`
	Version      string   `json:"version,omitempty"`
	Resolutions  []int    `json:"resolutions,omitempty"`
	ColorModes   []string `json:"colorModes,omitempty"`
	Formats      []string `json:"formats,omitempty"`
	MaxWidthMm   int      `json:"maxWidthMm,omitempty"`
	MaxHeightMm  int      `json:"maxHeightMm,omitempty"`
	Reason       string   `json:"reason,omitempty"`
}

// threeHundredthsToMm はeSCLの1/300インチ単位をmmへ直す（人が読むための表示用）。
func threeHundredthsToMm(value int) int {
	if value <= 0 {
		return 0
	}
	return int(float64(value) / 300.0 * 25.4)
}

func (h *scanHandler) inspect(ctx echo.Context, target string, configured bool) scannerInfo {
	info := scannerInfo{Target: target, Configured: configured}

	client, err := h.client(target)
	if err != nil {
		info.Reason = err.Error()
		return info
	}
	info.Target = client.Target()

	capabilities, err := client.Capabilities(ctx.Request().Context())
	if err != nil {
		info.Reason = err.Error()
		return info
	}

	info.Available = true
	info.MakeAndModel = capabilities.MakeAndModel
	info.Version = capabilities.Version
	info.Resolutions = capabilities.SupportedDPIs()
	info.ColorModes = capabilities.ColorModes
	info.Formats = capabilities.DocumentFormats
	if len(capabilities.DocumentFormatsExt) > 0 {
		info.Formats = capabilities.DocumentFormatsExt
	}
	info.MaxWidthMm = threeHundredthsToMm(capabilities.MaxWidth)
	info.MaxHeightMm = threeHundredthsToMm(capabilities.MaxHeight)
	return info
}

// ListScanners は設定済みのスキャナ（と target で指定された1台）の対応状況を返す。
// 会場で複数台を切り替えるとき、どれが使えるか・何dpiが選べるかを管理画面が判断するために使う。
//
// なおLAN上の自動検出（mDNS）はマルチキャストがコンテナへ届かないためここでは行わない。
// 検出はホスト側の scanner-bridge の GET /discover が担当する。
func (h *scanHandler) ListScanners(ctx echo.Context) error {
	targets := make([]string, 0, len(h.configuredTargets)+1)
	configured := make(map[string]bool, len(h.configuredTargets))
	for _, target := range h.configuredTargets {
		targets = append(targets, target)
		configured[target] = true
	}
	if requested := strings.TrimSpace(ctx.QueryParam("target")); requested != "" && !configured[requested] {
		if h.allowAnyTarget || h.isConfiguredTarget(requested) {
			targets = append(targets, requested)
		}
	}

	scanners := make([]scannerInfo, len(targets))
	var waitGroup sync.WaitGroup
	for index, target := range targets {
		waitGroup.Add(1)
		go func(index int, target string) {
			defer waitGroup.Done()
			scanners[index] = h.inspect(ctx, target, configured[target])
		}(index, target)
	}
	waitGroup.Wait()

	return ctx.JSON(http.StatusOK, map[string]any{
		"scanners": scanners,
		// 検出はホスト側のブリッジが担当することを管理画面へ伝える
		"discovery": "scanner-bridge",
	})
}

// GetScanStatus は単一のスキャナが使えるかを返す（管理画面の接続確認用）。
func (h *scanHandler) GetScanStatus(ctx echo.Context) error {
	target, err := h.resolveTarget(ctx)
	if err != nil {
		return ctx.JSON(http.StatusOK, map[string]any{
			"available": false,
			"source":    "escl",
			"reason":    err.Error(),
		})
	}

	info := h.inspect(ctx, target, true)
	return ctx.JSON(http.StatusOK, map[string]any{
		"available":    info.Available,
		"source":       "escl",
		"target":       info.Target,
		"makeAndModel": info.MakeAndModel,
		"resolutions":  info.Resolutions,
		"reason":       info.Reason,
	})
}

// Scan はスキャンを実行し、画像そのものを返す。
// 花火として登録するかどうかは呼び出し側（管理画面）が決めるため、
// ここではDBへの保存は行わず既存の POST /fireworks に委ねる。
func (h *scanHandler) Scan(ctx echo.Context) error {
	target, err := h.resolveTarget(ctx)
	if err != nil {
		if errors.Is(err, ErrTargetNotAllowed) {
			return ctx.JSON(http.StatusForbidden, map[string]string{"error": err.Error()})
		}
		return ctx.JSON(http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
	}

	client, err := h.client(target)
	if err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}

	options := infra.DefaultScanOptions()
	if raw := ctx.QueryParam("dpi"); raw != "" {
		dpi, convErr := strconv.Atoi(raw)
		if convErr != nil {
			return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "dpiは整数で指定してください"})
		}
		options.DPI = clampDPI(dpi)
	}
	if raw := strings.TrimSpace(ctx.QueryParam("colorMode")); raw != "" {
		options.ColorMode = raw
	}

	result, err := client.Scan(ctx.Request().Context(), options)
	if err != nil {
		if errors.Is(err, infra.ErrNoDocument) {
			return ctx.JSON(http.StatusBadGateway, map[string]string{
				"error": "スキャナから画像を取得できませんでした。原稿がセットされているか確認してください。",
			})
		}
		return ctx.JSON(http.StatusBadGateway, map[string]string{"error": err.Error()})
	}

	// 希望値と実際に使われた条件が違うことがあるため、結果をヘッダーで返す
	ctx.Response().Header().Set("X-Scan-Dpi", strconv.Itoa(result.DPI))
	ctx.Response().Header().Set("X-Scan-Color-Mode", result.ColorMode)
	ctx.Response().Header().Set("X-Scan-Target", client.Target())
	if result.MakeAndModel != "" {
		// ヘッダー値はASCIIに限るため、機種名はURLエンコードして返す（受け側でデコードする）
		ctx.Response().Header().Set("X-Scan-Model", url.QueryEscape(result.MakeAndModel))
	}
	ctx.Response().Header().Set(
		"Access-Control-Expose-Headers",
		"X-Scan-Dpi, X-Scan-Color-Mode, X-Scan-Target, X-Scan-Model",
	)

	return ctx.Blob(http.StatusOK, result.ContentType, result.Data)
}

func clampDPI(dpi int) int {
	if dpi < minScanDPI {
		return minScanDPI
	}
	if dpi > maxScanDPI {
		return maxScanDPI
	}
	return dpi
}
