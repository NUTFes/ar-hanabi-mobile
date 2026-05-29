package domain

import "gorm.io/gorm"

// 花火の構造体
type Firework struct {
	gorm.Model
	IsShareable bool    `gorm:"column:is_shareable"`
	ImagePath   *string `gorm:"column:image_path"` // SeaweedFS オブジェクトキー。旧レコードは nil
}
