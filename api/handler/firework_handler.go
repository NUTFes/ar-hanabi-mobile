package handler

import (
	"fmt"
	"mime/multipart"
	"net/http"
	"time"

	"github.com/labstack/echo/v4"
	openapi_types "github.com/oapi-codegen/runtime/types"

	"workshop-api/openapi"
	"workshop-api/usecase"
)

type fireworkHandler struct {
	Usecase usecase.FireworkUsecase
}

type FireworkHandler interface {
	GetFireworks(ctx echo.Context, params openapi.GetFireworksParams) error
	GetFireworkById(ctx echo.Context, id int64, params openapi.GetFireworkByIdParams) error
	CreateFirework(ctx echo.Context) error
	DeleteFirework(ctx echo.Context, id int64) error
	UpdateFirework(ctx echo.Context, id int64) error
}

func NewFireworkHandler(usecase usecase.FireworkUsecase) FireworkHandler {
	return &fireworkHandler{Usecase: usecase}
}

func (h *fireworkHandler) GetFireworks(ctx echo.Context, params openapi.GetFireworksParams) error {
	var from, to *time.Time
	if params.From != nil {
		t := params.From.Time
		from = &t
	}
	if params.To != nil {
		t := params.To.Time
		to = &t
	}
	fireworks, err := h.Usecase.GetFireworks(ctx.Request().Context(), from, to)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to retrieve fireworks"})
	}
	return ctx.JSON(http.StatusOK, fireworks)
}

func (h *fireworkHandler) GetFireworkById(ctx echo.Context, id int64, params openapi.GetFireworkByIdParams) error {
	firework, err := h.Usecase.GetFireworkByID(ctx.Request().Context(), id)
	if err != nil {
		return ctx.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	return ctx.JSON(http.StatusOK, firework)
}

func (h *fireworkHandler) CreateFirework(ctx echo.Context) error {
	form, err := ctx.MultipartForm()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Invalid multipart form")
	}

	files := form.File["image"]
	if len(files) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "No image file provided")
	}
	fmt.Println("Received image file handler:", files[0].Size, files[0].Filename, files[0].Header)

	fileData, err := convertToOpenAPIFile(files[0])
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "Failed to convert file")
	}

	isShareable := false
	if values, exists := form.Value["isShareable"]; exists && len(values) > 0 {
		isShareable = values[0] == "true"
	}

	req := openapi.FireworkCreateRequest{
		Image:       *fileData,
		IsShareable: isShareable,
	}

	firework, err := h.Usecase.CreateFirework(ctx.Request().Context(), req)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{
			"error": err.Error(),
		})
	}

	return ctx.JSON(http.StatusCreated, firework)
}

func convertToOpenAPIFile(header *multipart.FileHeader) (*openapi_types.File, error) {
	fileData := &openapi_types.File{}
	fileData.InitFromMultipart(header)
	return fileData, nil
}

func (h *fireworkHandler) DeleteFirework(ctx echo.Context, id int64) error {
	if err := h.Usecase.DeleteFirework(ctx.Request().Context(), id); err != nil {
		return ctx.JSON(http.StatusNotFound, map[string]string{"error": "not found"})
	}
	return ctx.NoContent(http.StatusNoContent)
}

func (h *fireworkHandler) UpdateFirework(ctx echo.Context, id int64) error {
	var req openapi.FireworkUpdateRequest
	if err := ctx.Bind(&req); err != nil {
		return ctx.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	firework, err := h.Usecase.UpdateFirework(ctx.Request().Context(), id, req)
	if err != nil {
		return ctx.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to update firework"})
	}
	return ctx.JSON(http.StatusOK, firework)
}
