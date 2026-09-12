/**
 * アクリルキーホルダーの物理寸法(mm)。
 * admin側の admin/utils/keychainLayout.ts と同じ値を保つこと。
 * admin側は印刷レイアウト（PDF・印刷ページ）、こちらはAR花火のパーティクル分布領域の
 * 縦横比に使い、管理画面でトリミングした正方形の絵が、印刷結果と同じ余白の付き方で
 * 花火になるようにする。
 */
const KEYCHAIN_WIDTH_MM = 45;
const KEYCHAIN_HEIGHT_MM = 32;
const KEYCHAIN_PADDING_MM = 2;

const KEYCHAIN_IMAGE_BOX_WIDTH_MM = KEYCHAIN_WIDTH_MM - KEYCHAIN_PADDING_MM * 2;
const KEYCHAIN_IMAGE_BOX_HEIGHT_MM = KEYCHAIN_HEIGHT_MM - KEYCHAIN_PADDING_MM * 2;

/** 絵が実際に収まる箱の縦横比（幅/高さ）。admin側の KEYCHAIN_IMAGE_ASPECT と同じ値。 */
export const KEYCHAIN_IMAGE_ASPECT = KEYCHAIN_IMAGE_BOX_WIDTH_MM / KEYCHAIN_IMAGE_BOX_HEIGHT_MM;
