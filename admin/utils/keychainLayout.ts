/**
 * アクリルキーホルダーの物理寸法(mm)。
 * QRCode.tsx の PDF生成・印刷ページ生成と、ImageCropModal.tsx のトリミング画面の
 * 両方から参照する。ここを唯一の定義元にすることで、トリミングで選んだ領域が
 * キーホルダーにそのまま（余白なく）印刷されるようにする。
 */
export const KEYCHAIN_WIDTH_MM = 45;
export const KEYCHAIN_HEIGHT_MM = 32;
export const KEYCHAIN_PADDING_MM = 2;

export const KEYCHAIN_IMAGE_BOX_WIDTH_MM = KEYCHAIN_WIDTH_MM - KEYCHAIN_PADDING_MM * 2;
export const KEYCHAIN_IMAGE_BOX_HEIGHT_MM = KEYCHAIN_HEIGHT_MM - KEYCHAIN_PADDING_MM * 2;

/** 絵が実際に収まる箱の縦横比（幅/高さ）。トリミング画面の aspect をこれに合わせる。 */
export const KEYCHAIN_IMAGE_ASPECT = KEYCHAIN_IMAGE_BOX_WIDTH_MM / KEYCHAIN_IMAGE_BOX_HEIGHT_MM;
