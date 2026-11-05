import type { User } from '@hisaab/shared';
import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogBody,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useSetUser } from '@/hooks/use-user';
import { ApiError, api } from '@/lib/api';
import {
    type Offset,
    clampOffset,
    cropScale,
    cropSource,
} from '@/lib/avatar-crop';

/** On-screen size of the crop frame, in CSS pixels. */
const FRAME = 256;
/** Size of the saved photo: sharp at the largest size it's shown. */
const OUTPUT = 320;
const MAX_ZOOM = 3;
/** Pixels moved by one arrow key press. */
const STEP = 10;

function cropToBlob(
    image: HTMLImageElement,
    zoom: number,
    offset: Offset,
): Promise<Blob> {
    const size = { width: image.naturalWidth, height: image.naturalHeight };
    const source = cropSource(size, FRAME, zoom, offset);
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('No canvas');

    // JPEG has no transparency; without this a clear PNG turns black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, OUTPUT, OUTPUT);
    context.imageSmoothingQuality = 'high';
    context.drawImage(
        image,
        source.x,
        source.y,
        source.size,
        source.size,
        0,
        0,
        OUTPUT,
        OUTPUT,
    );

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('No image'))),
            'image/jpeg',
            0.85,
        );
    });
}

/** Position and zoom a chosen image in a circle, then save it as the photo. */
export default function AvatarDialog({
    image,
    onClose,
}: {
    /** The decoded image; its src must be a data: URL (see the app's CSP). */
    image: HTMLImageElement;
    onClose: () => void;
}) {
    const setUser = useSetUser();
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
    const [saving, setSaving] = useState(false);
    const drag = useRef<{ pointer: Offset; start: Offset } | null>(null);

    const size = { width: image.naturalWidth, height: image.naturalHeight };
    const scale = cropScale(size, FRAME, zoom);

    const moveTo = (next: Offset, nextZoom = zoom) =>
        setOffset(clampOffset(next, size, FRAME, nextZoom));

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
            pointer: { x: event.clientX, y: event.clientY },
            start: offset,
        };
    };

    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
        if (!drag.current) return;

        const { pointer, start } = drag.current;
        moveTo({
            x: start.x + event.clientX - pointer.x,
            y: start.y + event.clientY - pointer.y,
        });
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const move: Record<string, Offset> = {
            ArrowLeft: { x: -STEP, y: 0 },
            ArrowRight: { x: STEP, y: 0 },
            ArrowUp: { x: 0, y: -STEP },
            ArrowDown: { x: 0, y: STEP },
        };
        const delta = move[event.key];
        if (!delta) return;

        event.preventDefault();
        moveTo({ x: offset.x + delta.x, y: offset.y + delta.y });
    };

    const save = async () => {
        setSaving(true);

        try {
            const data = await api<{ user: User; message: string }>(
                '/settings/avatar',
                {
                    method: 'PUT',
                    body: await cropToBlob(image, zoom, offset),
                    headers: { 'Content-Type': 'image/jpeg' },
                },
            );
            setUser(data.user);
            toast.success(data.message);
            onClose();
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : "We couldn't save that photo. Please try another.",
            );
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Position your photo</DialogTitle>
                    <DialogDescription>
                        Drag to move it, and use the slider to zoom.
                    </DialogDescription>
                </DialogHeader>

                <DialogBody className="space-y-5">
                    <div
                        role="group"
                        tabIndex={0}
                        aria-label="Photo position. Arrow keys move the photo."
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={() => (drag.current = null)}
                        onPointerCancel={() => (drag.current = null)}
                        onKeyDown={onKeyDown}
                        className="relative mx-auto size-64 cursor-grab touch-none overflow-hidden rounded-lg bg-muted outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50 active:cursor-grabbing"
                    >
                        <img
                            src={image.src}
                            alt=""
                            draggable={false}
                            className="absolute top-1/2 left-1/2 max-w-none"
                            style={{
                                width: size.width * scale,
                                height: size.height * scale,
                                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                            }}
                        />
                        {/* The circle: dims everything outside what's kept. */}
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/80"
                            style={{
                                boxShadow: '0 0 0 200px rgb(0 0 0 / 0.55)',
                            }}
                        />
                    </div>

                    <div className="mx-auto max-w-64 space-y-2">
                        <Label htmlFor="avatar-zoom">Zoom</Label>
                        <input
                            id="avatar-zoom"
                            type="range"
                            min={1}
                            max={MAX_ZOOM}
                            step={0.01}
                            value={zoom}
                            onChange={(event) => {
                                const next = Number(event.target.value);
                                setZoom(next);
                                moveTo(offset, next);
                            }}
                            className="range-slider"
                            style={
                                {
                                    '--fill': `${((zoom - 1) / (MAX_ZOOM - 1)) * 100}%`,
                                } as React.CSSProperties
                            }
                        />
                    </div>
                </DialogBody>

                <DialogFooter>
                    <Button
                        variant="secondary"
                        disabled={saving}
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button disabled={saving} onClick={() => void save()}>
                        {saving && <Spinner />}
                        Save photo
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
