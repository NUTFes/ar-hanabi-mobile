import Image from 'next/image';

interface FireworkPreviewProps {
  imageUrl: string;
  size?: number;
}

export default function FireworkPreview({ imageUrl, size = 100 }: FireworkPreviewProps) {
  if (!imageUrl) return null;

  return (
    <div style={{ width: `${size}px`, height: `${size}px` }}>
      <Image
        src={imageUrl}
        alt="Firework preview"
        width={size}
        height={size}
        style={{ objectFit: 'contain' }}
        unoptimized={true}
      />
    </div>
  );
}
