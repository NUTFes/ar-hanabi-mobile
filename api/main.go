package main

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"workshop-api/domain"
	"workshop-api/handler"
	"workshop-api/infra"
	"workshop-api/openapi"
	"workshop-api/usecase"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	dbUser := os.Getenv("POSTGRES_USER")
	dbPassword := os.Getenv("POSTGRES_PASSWORD")
	dbHost := os.Getenv("POSTGRES_HOST")
	dbPort := os.Getenv("POSTGRES_PORT")
	dbName := os.Getenv("POSTGRES_DB")

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", dbUser, dbPassword, dbHost, dbPort, dbName)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		panic("failed to connect database")
	}

	db.AutoMigrate(
		&domain.Firework{},
	)
	fmt.Println("migrated")

	storageEndpoint := os.Getenv("STORAGE_ENDPOINT")
	storagePublicURL := os.Getenv("STORAGE_PUBLIC_URL")
	storageBucket := os.Getenv("STORAGE_BUCKET")
	storageAccess := os.Getenv("STORAGE_ACCESS_KEY")
	storageSecret := os.Getenv("STORAGE_SECRET_KEY")

	storageClient, err := infra.NewStorageClient(
		context.Background(),
		storageEndpoint,
		storagePublicURL,
		storageBucket,
		storageAccess,
		storageSecret,
	)
	if err != nil {
		panic("failed to connect storage: " + err.Error())
	}

	e := echo.New()

	e.Use(middleware.Logger())
	e.Use(middleware.Recover())

	swaggerUrl := os.Getenv("SWAGGER_URL")
	swaggerStgUrl := os.Getenv("SWAGGER_STG_URL")
	adminUrl := os.Getenv("ADMIN_URL")
	adminStgUrl := os.Getenv("ADMIN_STG_URL")
	fmt.Println("Swagger URL:", swaggerUrl)
	fmt.Println("Swagger Staging URL:", swaggerStgUrl)
	fmt.Println("Admin URL:", adminUrl)
	fmt.Println("Admin Staging URL:", adminStgUrl)

	e.Use(middleware.CORSWithConfig(middleware.CORSConfig{
		AllowOrigins: []string{
			"http://localhost:8081",
			"http://127.0.0.1:8081",
			"http://localhost:8080",
			"http://127.0.0.1:8080",
			"http://localhost:3000",
			"http://127.0.0.1:3000",
			"http://localhost:5173",
			"http://127.0.0.1:5173",
			"https://hanabi.nutfes.net",
			"https://hanabi-stg.nutfes.net",
			adminUrl,
			adminStgUrl,
			swaggerUrl,
			swaggerStgUrl,
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		AllowCredentials: true,
	}))

	fireworkUsecase := usecase.NewFireworkUsecase(db, storageClient)
	fireworkHandler := handler.NewFireworkHandler(fireworkUsecase)

	openapi.RegisterHandlers(e, fireworkHandler)

	e.Start(":8080")
}
