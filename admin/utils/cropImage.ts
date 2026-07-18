import type { Area } from 'react-easy-crop';

function createImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.src = src;
  });
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Crops and rotates an image, returning the result as a File.
 * Follows the canvas approach documented by react-easy-crop:
 * draw the source image rotated onto a bounding-box canvas, then
 * extract the cropped area onto a second canvas of the final size.
 */
export async function getCroppedImg(
  imageSrc: string,
  croppedAreaPixels: Area,
  rotation: number,
  fileName: string,
  mimeType: string
): Promise<File> {
  const image = await createImage(imageSrc);

  const rotRad = toRadians(rotation);
  const sin = Math.abs(Math.sin(rotRad));
  const cos = Math.abs(Math.cos(rotRad));
  const boundingWidth = image.width * cos + image.height * sin;
  const boundingHeight = image.width * sin + image.height * cos;

  const rotateCanvas = document.createElement('canvas');
  rotateCanvas.width = boundingWidth;
  rotateCanvas.height = boundingHeight;
  const rotateCtx = rotateCanvas.getContext('2d');
  if (!rotateCtx) {
    throw new Error('Failed to get 2D canvas context');
  }

  rotateCtx.translate(boundingWidth / 2, boundingHeight / 2);
  rotateCtx.rotate(rotRad);
  rotateCtx.drawImage(image, -image.width / 2, -image.height / 2);

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = croppedAreaPixels.width;
  outputCanvas.height = croppedAreaPixels.height;
  const outputCtx = outputCanvas.getContext('2d');
  if (!outputCtx) {
    throw new Error('Failed to get 2D canvas context');
  }

  outputCtx.drawImage(
    rotateCanvas,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    croppedAreaPixels.width,
    croppedAreaPixels.height
  );

  const outputType = mimeType || 'image/png';

  return new Promise((resolve, reject) => {
    outputCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to generate cropped image blob'));
        return;
      }
      resolve(new File([blob], fileName, { type: outputType }));
    }, outputType);
  });
}
