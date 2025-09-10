import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Detector from './pages/Detector';
import Finale from './pages/Finale';


// ===== Appコンポーネント =====
// - **ルーティング（`react-router-dom`）の設定**
// - グローバルに共通なレイアウトやUI（例：ナビバー、ヘッダーなど）もここでラップしてOK
export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />             {/* ホーム画面 */}
        <Route path="/detector" element={<Detector />} /> {/* ジャンプ検出画面 */}
        <Route path="/finale" element={<Finale />} />     {/* フィナーレ花火大会画面 */}
      </Routes>
    </Router>
  )
}
