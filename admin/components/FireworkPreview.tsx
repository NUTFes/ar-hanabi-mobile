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

  const pixelSize = size / dimension;

  return (
      <div
          className="bg-black border border-gray-300"
          style={{ width: `${size}px`, height: `${size}px`, position: 'relative' }}
      >
        {pixelData.map((isActive, index) => {
          const x = index % dimension;
          const y = Math.floor(index / dimension);
          return (
              <div
                  key={index}
                  style={{
                    position: 'absolute',
                    left: `${x * pixelSize}px`,
                    top: `${y * pixelSize}px`,
                    width: `${pixelSize}px`,
                    height: `${pixelSize}px`,
                    backgroundColor: isActive ? 'white' : 'transparent',
                  }}
              />
          );
        })}
      </div>
  );
}
