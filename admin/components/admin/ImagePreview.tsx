"use client";

import Image from "next/image";
import { useState } from "react";

interface ImagePreviewProps {
  imageUrl?: string | null;
}

export default function ImagePreview({
  imageUrl,
}: ImagePreviewProps) {
  const [hasError, setHasError] = useState(false);

  if (!imageUrl || hasError) {
    return (
      <div
        style={{
          width: 200,
          height: 200,
          padding: "1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f7fafc",
          border: "2px solid #e2e8f0",
          borderRadius: "12px",
          color: "#718096",
          boxSizing: "content-box",
        }}
      >
        {hasError ? "画像の読み込みに失敗しました" : "画像がありません"}
      </div>
    );
  }

  return (
    <div
      style={{
        width: 200,
        height: 200,
        padding: "1.5rem",
        backgroundColor: "white",
        border: "2px solid #e2e8f0",
        borderRadius: "12px",
        boxShadow: "0 4px 6px rgba(0, 0, 0, 0.07)",
        boxSizing: "content-box",
      }}
    >
      <Image
        src={imageUrl}
        alt="花火画像のプレビュー"
        width={200}
        height={200}
        unoptimized
        onError={() => setHasError(true)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
          borderRadius: "8px",
        }}
      />
    </div>
  );
}