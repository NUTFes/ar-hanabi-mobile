'use client';

import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { secondaryButtonStyle, dangerButtonStyle, inputStyle } from '@/styles/adminStyles';
import {
  DEFAULT_SCAN_DPI,
  FALLBACK_DPI_OPTIONS,
  SCAN_ROUTE_LABELS,
  ScannerOption,
  bridgeStartCommands,
  checkScanner,
  loadScanners,
  scanWithScanner,
} from '@/utils/scanner';

interface ScanPanelProps {
  /** スキャンした画像を受け取る。既存のファイル選択と同じ編集フローへ流す */
  onScanned: (file: File) => void;
}

// 会場でプリンターを入れ替えても選び直さずに済むよう、選択内容は端末に覚えさせる
const STORAGE_KEYS = {
  scanner: 'scanner.selectedId',
  dpi: 'scanner.dpi',
} as const;

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // プライベートモード等で書けない場合は覚えないだけにする
  }
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '0.5rem',
  fontWeight: 600,
  color: '#4a5568',
};

const noteStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#718096',
  margin: '0.5rem 0 0',
  lineHeight: 1.6,
};

const subtleButtonStyle: React.CSSProperties = {
  ...secondaryButtonStyle,
  background: '#edf2f7',
  color: '#4a5568',
};

export default function ScanPanel({ onScanned }: ScanPanelProps) {
  const [scanners, setScanners] = useState<ScannerOption[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [dpi, setDpi] = useState(DEFAULT_SCAN_DPI);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [bridgeAvailable, setBridgeAvailable] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const selected = scanners.find((scanner) => scanner.id === selectedId);

  // 選択中の機種が対応している解像度だけを出す（対応外を要求すると
  // ジョブが受理されてもスキャンされない機種があるため）
  const dpiOptions =
    selected?.resolutions && selected.resolutions.length > 0 ? selected.resolutions : FALLBACK_DPI_OPTIONS;

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const result = await loadScanners();
      setScanners(result.scanners);
      setWarnings(result.warnings);
      setBridgeAvailable(result.bridgeAvailable);

      // 保存済みの選択が使えなければ、使えるものを自動で選ぶ
      setSelectedId((current) => {
        if (current && result.scanners.some((scanner) => scanner.id === current && scanner.usable)) {
          return current;
        }
        const usable = result.scanners.find((scanner) => scanner.usable);
        return usable ? usable.id : '';
      });

      const usableCount = result.scanners.filter((scanner) => scanner.usable).length;
      setMessage(usableCount > 0 ? `使用できるスキャナ ${usableCount} 台` : null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const storedScanner = readStored(STORAGE_KEYS.scanner);
    if (storedScanner) setSelectedId(storedScanner);

    const storedDpi = Number(readStored(STORAGE_KEYS.dpi));
    if (Number.isFinite(storedDpi) && storedDpi > 0) setDpi(storedDpi);

    void refresh();
  }, [refresh]);

  const handleScannerChange = (value: string) => {
    setSelectedId(value);
    writeStored(STORAGE_KEYS.scanner, value);
    setMessage(null);
    setErrorMessage(null);
  };

  const handleDpiChange = (value: number) => {
    setDpi(value);
    writeStored(STORAGE_KEYS.dpi, String(value));
  };

  const handleCheckConnection = useCallback(async () => {
    if (!selected) {
      setErrorMessage('スキャナを選択してください。');
      return;
    }

    setIsChecking(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      const result = await checkScanner(selected);
      if (result.ok) {
        setMessage(`✅ 接続OK（${result.detail}）`);
      } else {
        setErrorMessage(result.detail);
      }
    } finally {
      setIsChecking(false);
    }
  }, [selected]);

  const handleScan = useCallback(async () => {
    if (!selected) {
      setErrorMessage('スキャナを選択してください（見つからない場合は「再検索」を押してください）。');
      return;
    }

    setIsScanning(true);
    setMessage(null);
    setErrorMessage(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const outcome = await scanWithScanner(selected, { dpi, signal: controller.signal });

      const details = [
        `${Math.round(outcome.file.size / 1024)} KB`,
        outcome.dpi ? `${outcome.dpi}dpi` : '',
        outcome.model || selected.model,
      ]
        .filter(Boolean)
        .join(' / ');

      // 要求した解像度が本体の対応外で自動調整された場合は明示する
      const adjusted =
        outcome.dpi && outcome.dpi !== dpi
          ? ` — ${dpi}dpiは本体が対応していないため ${outcome.dpi}dpi で読み取りました`
          : '';
      setMessage(`✅ 読み取りました（${details}）${adjusted}`);

      onScanned(outcome.file);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setMessage('スキャンを中止しました。');
      } else {
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    } finally {
      abortControllerRef.current = null;
      setIsScanning(false);
    }
  }, [selected, dpi, onScanned]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  // ブリッジが起動していないときに表示する起動コマンド。
  // 管理画面自身のオリジンを埋め込むので、どのドメインにデプロイしても正しい許可Originになる
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const startCommands = typeof window !== 'undefined' ? bridgeStartCommands(window.location.origin) : null;
  const startCommand = startCommands ? (isMac ? startCommands.mac : startCommands.windows) : '';

  const handleCopyCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(startCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードが使えない環境では、表示されたコマンドを手で選択してもらう
    }
  }, [startCommand]);

  const busy = isScanning || isLoading;

  return (
    <div
      style={{
        backgroundColor: '#f7fafc',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '1rem',
        marginBottom: '1rem',
      }}
    >
      <label style={labelStyle}>🖨️ スキャナから読み取る:</label>

      {!bridgeAvailable && !isLoading && startCommand && (
        <div
          style={{
            backgroundColor: '#fffaf0',
            border: '1px solid #f6ad55',
            borderRadius: '8px',
            padding: '0.75rem',
            marginBottom: '0.75rem',
          }}
        >
          <p style={{ ...noteStyle, margin: 0, color: '#744210', fontWeight: 600 }}>
            🔌 このPCでスキャナーブリッジが起動していません
          </p>
          <p style={{ ...noteStyle, color: '#744210' }}>
            {isMac ? 'ターミナル' : 'PowerShell'}
            を開いて次の1行を貼り付けて実行してください（インストール不要
            {isMac ? '・Node.js が必要' : ''}）。起動したままにして「再検索」を押します。
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'stretch', marginTop: '0.5rem' }}>
            <code
              style={{
                flex: '1 1 auto',
                display: 'block',
                padding: '0.5rem 0.75rem',
                backgroundColor: '#2d3748',
                color: '#f7fafc',
                borderRadius: '6px',
                fontSize: '0.75rem',
                overflowX: 'auto',
                whiteSpace: 'nowrap',
                userSelect: 'all',
              }}
            >
              {startCommand}
            </code>
            <button
              type="button"
              onClick={handleCopyCommand}
              style={{ ...subtleButtonStyle, flex: '0 0 auto', margin: 0, padding: '0.5rem 0.75rem' }}
            >
              {copied ? '✅ コピー済み' : '📋 コピー'}
            </button>
          </div>
          <p style={{ ...noteStyle, color: '#744210' }}>
            {isMac
              ? 'macOS では Wi-Fi 接続のプリンター（eSCL）のみ使えます。USB接続のスキャナは Windows PC で使ってください。'
              : 'USB接続・Wi-Fi接続どちらのプリンターも使えます。初回はブラウザが「ローカルネットワークへのアクセス」の許可を求めることがあるので許可してください。'}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
        <select
          value={selectedId}
          onChange={(e) => handleScannerChange(e.target.value)}
          disabled={busy}
          style={{ ...inputStyle, flex: '1 1 14rem', marginBottom: 0 }}
        >
          <option value="">
            {isLoading ? '検索中...' : scanners.length === 0 ? 'スキャナが見つかりません' : '選択してください'}
          </option>
          {scanners.map((scanner) => (
            <option key={scanner.id} value={scanner.id} disabled={!scanner.usable}>
              {scanner.label}
              {scanner.usable ? '' : '（使用できません）'}
            </option>
          ))}
        </select>

        <select
          value={dpi}
          onChange={(e) => handleDpiChange(Number(e.target.value))}
          disabled={busy}
          style={{ ...inputStyle, flex: '0 0 7rem', marginBottom: 0 }}
        >
          {dpiOptions.map((option) => (
            <option key={option} value={option}>
              {option} dpi
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy}
          style={{
            ...subtleButtonStyle,
            flex: '0 0 6rem',
            opacity: busy ? 0.6 : 1,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? '検索中...' : '🔄 再検索'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={handleScan}
          disabled={isScanning}
          style={{
            ...secondaryButtonStyle,
            flex: '1 1 10rem',
            opacity: isScanning ? 0.6 : 1,
            cursor: isScanning ? 'not-allowed' : 'pointer',
          }}
        >
          {isScanning ? '⏳ スキャン中...' : '📷 スキャンして取り込む'}
        </button>

        {isScanning ? (
          <button type="button" onClick={handleCancel} style={{ ...dangerButtonStyle, flex: '0 0 6rem' }}>
            ✋ 中止
          </button>
        ) : (
          <button
            type="button"
            onClick={handleCheckConnection}
            disabled={isChecking}
            style={{
              ...subtleButtonStyle,
              flex: '0 0 7rem',
              opacity: isChecking ? 0.6 : 1,
              cursor: isChecking ? 'not-allowed' : 'pointer',
            }}
          >
            {isChecking ? '確認中...' : '🔌 接続確認'}
          </button>
        )}
      </div>

      {message && <p style={{ ...noteStyle, color: '#38a169', fontWeight: 500 }}>{message}</p>}

      {errorMessage && (
        <p style={{ ...noteStyle, color: '#c53030', fontWeight: 500, whiteSpace: 'pre-line' }}>⚠️ {errorMessage}</p>
      )}

      {warnings.map((warning) => (
        <p key={warning} style={{ ...noteStyle, color: '#b7791f' }}>
          ※ {warning}
        </p>
      ))}

      {/* 経路は自動で選ぶが、当日の切り分けのために何が使われるかは見せておく */}
      {selected && selected.usable && (
        <p style={noteStyle}>
          読み取り経路: {SCAN_ROUTE_LABELS[selected.routes.find((route) => route.usable)!.route]}
          {selected.routes.filter((route) => route.usable).length > 1 &&
            '（失敗した場合はもう一方の経路を自動で試します）'}
        </p>
      )}

      <p style={noteStyle}>原稿を下向きにセットしてから実行してください。読み取り後は画像の編集画面が開きます。</p>
    </div>
  );
}
