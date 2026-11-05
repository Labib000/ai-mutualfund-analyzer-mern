/** Where the image sits in the square crop frame, and what that keeps of it. */
export type CropSize = { width: number; height: number };
export type Offset = { x: number; y: number };

/** Displayed pixels per image pixel. At zoom 1 the short side fills the frame. */
export function cropScale(image: CropSize, frame: number, zoom: number) {
    return (frame / Math.min(image.width, image.height)) * zoom;
}

/** Keeps the frame covered: the image can't be dragged past its own edges. */
export function clampOffset(
    offset: Offset,
    image: CropSize,
    frame: number,
    zoom: number,
): Offset {
    const scale = cropScale(image, frame, zoom);
    const maxX = Math.max(0, (image.width * scale - frame) / 2);
    const maxY = Math.max(0, (image.height * scale - frame) / 2);

    return {
        x: Math.min(maxX, Math.max(-maxX, offset.x)),
        y: Math.min(maxY, Math.max(-maxY, offset.y)),
    };
}

/** The square of the original image, in its own pixels, shown in the frame. */
export function cropSource(
    image: CropSize,
    frame: number,
    zoom: number,
    offset: Offset,
) {
    const scale = cropScale(image, frame, zoom);

    return {
        x: image.width / 2 - (frame / 2 + offset.x) / scale,
        y: image.height / 2 - (frame / 2 + offset.y) / scale,
        size: frame / scale,
    };
}
