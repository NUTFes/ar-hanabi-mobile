package usecase

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image/jpeg"
	"net/http"
	"os/exec"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"workshop-api/domain"
	"workshop-api/infra"
	"workshop-api/openapi"
)

type fireworkUsecase struct {
	db      *gorm.DB
	storage infra.StorageClient
}

type FireworkUsecase interface {
	GetFireworks(ctx context.Context, from, to *time.Time) ([]openapi.FireworkResponse, error)
	GetFireworkByID(ctx context.Context, id int64) (openapi.FireworkResponse, error)
	CreateFirework(ctx context.Context, req openapi.FireworkCreateRequest) (openapi.FireworkResponse, error)
	DeleteFirework(ctx context.Context, id int64) error
	UpdateFirework(ctx context.Context, id int64, req openapi.FireworkUpdateRequest) (openapi.FireworkResponse, error)
}

func NewFireworkUsecase(db *gorm.DB, storage infra.StorageClient) FireworkUsecase {
	return &fireworkUsecase{db: db, storage: storage}
}

func (uc *fireworkUsecase) GetFireworks(ctx context.Context, from, to *time.Time) ([]openapi.FireworkResponse, error) {
	var fireworks []domain.Firework
	query := uc.db.WithContext(ctx).Order("created_at DESC")

	if from != nil {
		query = query.Where("created_at >= ?", from)
	}
	if to != nil {
		end := to.Add(24*time.Hour - time.Nanosecond)
		query = query.Where("created_at <= ?", end)
	}

	if err := query.Find(&fireworks).Error; err != nil {
		return nil, fmt.Errorf("failed to retrieve fireworks: %w", err)
	}

	var responses []openapi.FireworkResponse
	for _, fw := range fireworks {
		var imageUrl *string
		if fw.ImagePath != nil {
			url := uc.storage.PublicURL(*fw.ImagePath)
			imageUrl = &url
		}
		responses = append(responses, openapi.FireworkResponse{
			Id:          int64(fw.ID),
			IsShareable: fw.IsShareable,
			ImageUrl:    imageUrl,
			CreatedAt:   &fw.CreatedAt,
			UpdatedAt:   &fw.UpdatedAt,
		})
	}
	return responses, nil
}

func (uc *fireworkUsecase) GetFireworkByID(ctx context.Context, id int64) (openapi.FireworkResponse, error) {
	var fw domain.Firework
	if err := uc.db.WithContext(ctx).First(&fw, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return openapi.FireworkResponse{}, echo.NewHTTPError(http.StatusNotFound, "Firework not found")
		}
		return openapi.FireworkResponse{}, fmt.Errorf("failed to retrieve firework: %w", err)
	}

	var imageUrl *string
	if fw.ImagePath != nil {
		url := uc.storage.PublicURL(*fw.ImagePath)
		imageUrl = &url
	}

	return openapi.FireworkResponse{
		Id:          int64(fw.ID),
		IsShareable: fw.IsShareable,
		ImageUrl:    imageUrl,
		CreatedAt:   &fw.CreatedAt,
		UpdatedAt:   &fw.UpdatedAt,
	}, nil
}

func (uc *fireworkUsecase) CreateFirework(ctx context.Context, req openapi.FireworkCreateRequest) (openapi.FireworkResponse, error) {
	imageBytes, err := req.Image.Bytes()
	if err != nil {
		return openapi.FireworkResponse{}, fmt.Errorf("failed to read image file: %w", err)
	}

	mimeType, ext := detectImageFormat(imageBytes)
	if mimeType == "" {
		return openapi.FireworkResponse{}, echo.NewHTTPError(http.StatusBadRequest, "unsupported image format: only jpeg, png, heic are accepted")
	}

	if mimeType == "image/heic" {
		imageBytes, err = convertHEICToJPEG(imageBytes)
		if err != nil {
			return openapi.FireworkResponse{}, fmt.Errorf("failed to convert heic to jpeg: %w", err)
		}
		mimeType, ext = "image/jpeg", ".jpg"
	}

	key := fmt.Sprintf("images/%s%s", uuid.New().String(), ext)

	if err := uc.storage.Upload(ctx, key, imageBytes, mimeType); err != nil {
		return openapi.FireworkResponse{}, fmt.Errorf("failed to upload image: %w", err)
	}

	firework := domain.Firework{
		IsShareable: req.IsShareable,
		ImagePath:   &key,
	}

	if err := uc.db.WithContext(ctx).Create(&firework).Error; err != nil {
		_ = uc.storage.Delete(ctx, key)
		return openapi.FireworkResponse{}, fmt.Errorf("failed to create firework: %w", err)
	}

	imageUrl := uc.storage.PublicURL(key)
	return openapi.FireworkResponse{
		Id:          int64(firework.ID),
		IsShareable: firework.IsShareable,
		ImageUrl:    &imageUrl,
		CreatedAt:   &firework.CreatedAt,
		UpdatedAt:   &firework.UpdatedAt,
	}, nil
}

func (uc *fireworkUsecase) DeleteFirework(ctx context.Context, id int64) error {
	var fw domain.Firework
	if err := uc.db.WithContext(ctx).First(&fw, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Firework not found")
		}
		return fmt.Errorf("failed to retrieve firework: %w", err)
	}

	if err := uc.db.WithContext(ctx).Delete(&fw).Error; err != nil {
		return fmt.Errorf("failed to delete firework with id %d: %w", id, err)
	}

	if fw.ImagePath != nil {
		_ = uc.storage.Delete(ctx, *fw.ImagePath)
	}

	return nil
}

func (uc *fireworkUsecase) UpdateFirework(ctx context.Context, id int64, req openapi.FireworkUpdateRequest) (openapi.FireworkResponse, error) {
	var fw domain.Firework
	if err := uc.db.WithContext(ctx).First(&fw, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return openapi.FireworkResponse{}, echo.NewHTTPError(http.StatusNotFound, "Firework not found")
		}
		return openapi.FireworkResponse{}, fmt.Errorf("firework with id %d not found: %w", id, err)
	}

	fw.IsShareable = req.IsShareable

	if err := uc.db.WithContext(ctx).Save(&fw).Error; err != nil {
		return openapi.FireworkResponse{}, fmt.Errorf("failed to update firework: %w", err)
	}

	var imageUrl *string
	if fw.ImagePath != nil {
		url := uc.storage.PublicURL(*fw.ImagePath)
		imageUrl = &url
	}

	return openapi.FireworkResponse{
		Id:          int64(fw.ID),
		IsShareable: fw.IsShareable,
		ImageUrl:    imageUrl,
		CreatedAt:   &fw.CreatedAt,
		UpdatedAt:   &fw.UpdatedAt,
	}, nil
}

// detectImageFormat は画像バイト列からMIMEタイプと拡張子を返す。
// 非対応フォーマットの場合は空文字を返す。
func detectImageFormat(data []byte) (mimeType, ext string) {
	if isHEIC(data) {
		return "image/heic", ".heic"
	}
	mime := http.DetectContentType(data)
	switch mime {
	case "image/jpeg":
		return "image/jpeg", ".jpg"
	case "image/png":
		return "image/png", ".png"
	default:
		return "", ""
	}
}

// isHEIC は HEIF/HEIC のマジックバイトを確認する。
// ISOBMFF 構造: bytes[4:8] == "ftyp", bytes[8:12] == major brand
func isHEIC(data []byte) bool {
	if len(data) < 12 {
		return false
	}
	if string(data[4:8]) != "ftyp" {
		return false
	}
	brand := string(data[8:12])
	switch brand {
	case "heic", "heis", "hevc", "hevx", "mif1", "msf1":
		return true
	}
	return false
}

// convertHEICToJPEG は ImageMagick を使って HEIC バイト列を JPEG に変換する。
func convertHEICToJPEG(data []byte) ([]byte, error) {
	cmd := exec.Command("convert", "heic:-", "jpeg:-")
	cmd.Stdin = bytes.NewReader(data)
	var out, errBuf bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &errBuf
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("imagemagick convert failed: %w: %s", err, errBuf.String())
	}
	if _, err := jpeg.DecodeConfig(bytes.NewReader(out.Bytes())); err != nil {
		return nil, fmt.Errorf("converted output is not valid jpeg: %w", err)
	}
	return out.Bytes(), nil
}
