import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * scanner-bridge のファイルを管理画面から配信する。
 *
 * 会場のPCに Node.js やリポジトリを入れなくても、管理画面に表示される1行のコマンド
 *   Windows: $env:HANABI_ADMIN_ORIGIN='<origin>'; irm <origin>/bridge/start.ps1 | iex
 *   macOS  : HANABI_ADMIN_ORIGIN=<origin> curl -fsSL <origin>/bridge/start.sh | bash
 * でブリッジを起動できるようにするためのもの。デプロイと同時にブリッジも更新される。
 *
 * ソースは docker-compose で /app/bridge-src にマウントされた scanner-bridge/ を読む
 * （複製をリポジトリに持たない）。配信するファイル名は固定のリストに限定する。
 * Basic認証は middleware.ts でこのパスだけ除外している（コードは秘密ではない）。
 */

const ALLOWED_FILES = new Set([
  'start.ps1',
  'start.sh',
  'bridge.ps1',
  'wia-scan.ps1',
  'server.js',
  'mdns.js',
  'escl.js',
  'identity.js',
  'README.md',
]);

const SOURCE_DIR = process.env.BRIDGE_SOURCE_DIR || path.join(process.cwd(), '..', 'scanner-bridge');

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, context: { params: Promise<{ file: string[] }> }) {
  const { file } = await context.params;
  const name = (file || []).join('/');

  if (!ALLOWED_FILES.has(name)) {
    return new NextResponse('not found', { status: 404 });
  }

  try {
    const data = await fs.readFile(path.join(SOURCE_DIR, name));
    // Node の Buffer は BodyInit に直接渡せないため Uint8Array に包む
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        // PowerShell の irm / curl がそのまま読めるようテキストで返す
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new NextResponse('not found', { status: 404 });
  }
}
