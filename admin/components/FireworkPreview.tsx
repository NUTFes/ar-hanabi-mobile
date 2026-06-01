interface FireworkPreviewProps {
  pixelData: boolean[];
  size?: number;
}

export default function FireworkPreview({ pixelData, size = 100 }: FireworkPreviewProps) {
  if (!pixelData || pixelData.length === 0) return null;

  const dimension = Math.sqrt(pixelData.length);
  if (dimension !== Math.floor(dimension)) {
    console.error('Pixel data is not a perfect square');
    return null;
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