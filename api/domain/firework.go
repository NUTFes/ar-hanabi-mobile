package domain

import "gorm.io/gorm"

// 花火の構造体
type Firework struct {
	gorm.Model
	IsShareable bool    `gorm:"column:is_shareable"`
	PixelData   []byte  `gorm:"column:pixel_data"` // 旧レコード互換。新レコードは nil
	ImagePath   *string `gorm:"column:image_path"` // SeaweedFS オブジェクトキー。旧レコードは nil
}
