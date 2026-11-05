import type { SettingsSummaryResponse, User } from '@hisaab/shared';
import { useQuery } from '@tanstack/react-query';
import { type ChangeEvent, useRef, useState } from 'react';
import { toast } from 'sonner';

import AvatarDialog from '@/components/settings/avatar-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { useInitials } from '@/hooks/use-initials';
import { useSetUser, useUser } from '@/hooks/use-user';
import { ApiError, api } from '@/lib/api';
import { formatMonthYear } from '@/lib/format';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Reads a file as a data: URL, since the app's CSP doesn't allow blob: images. */
function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('unreadable'));
        reader.onload = () => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('undecodable'));
            image.src = reader.result as string;
        };
        reader.readAsDataURL(file);
    });
}

/** Who you are, beside every settings tab. Owns the profile photo controls. */
export default function ProfileCard() {
    const user = useUser();
    const setUser = useSetUser();
    const getInitials = useInitials();
    const input = useRef<HTMLInputElement>(null);
    const [image, setImage] = useState<HTMLImageElement | null>(null);
    const [removing, setRemoving] = useState(false);
    const verified = user.emailVerifiedAt !== null;

    const summary = useQuery({
        queryKey: ['settings-summary'],
        queryFn: () => api<SettingsSummaryResponse>('/settings/summary'),
    });

    const choose = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = ''; // so choosing the same file again still fires
        if (!file) return;

        if (!ACCEPTED.includes(file.type)) {
            toast.error('Please choose a JPG, PNG or WebP image.');
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            toast.error('Please choose an image under 10 MB.');
            return;
        }

        try {
            setImage(await loadImage(file));
        } catch {
            toast.error("We couldn't open that image. Please try another.");
        }
    };

    const remove = async () => {
        setRemoving(true);

        try {
            const data = await api<{ user: User; message: string }>(
                '/settings/avatar',
                { method: 'DELETE' },
            );
            setUser(data.user);
            toast.success(data.message);
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : 'Something went wrong. Please try again.',
            );
        } finally {
            setRemoving(false);
        }
    };

    return (
        <Card className="gap-0 p-4 sm:gap-0 sm:p-6 @4xl:sticky @4xl:top-20">
            <div className="flex items-center gap-4 @4xl:flex-col @4xl:text-center">
                <Avatar className="size-20 shrink-0 ring-1 ring-border ring-offset-2 ring-offset-card @4xl:size-28">
                    <AvatarImage
                        src={user.avatarUrl ?? undefined}
                        alt={`${user.name}'s photo`}
                    />
                    <AvatarFallback className="bg-primary/10 font-display text-2xl font-semibold text-primary @4xl:text-3xl">
                        {getInitials(user.name)}
                    </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1 space-y-1.5 @4xl:w-full">
                    <p className="font-display text-lg leading-snug font-semibold break-words">
                        {user.name}
                    </p>
                    <p className="text-sm break-all text-muted-foreground">
                        {user.email}
                    </p>
                    <Badge variant={verified ? 'secondary' : 'outline'}>
                        {verified ? 'Verified' : 'Unverified'}
                    </Badge>
                </div>
            </div>

            <div className="mt-4 flex gap-2 @4xl:mt-5">
                <input
                    ref={input}
                    type="file"
                    accept={ACCEPTED.join(',')}
                    aria-label="Choose a profile photo"
                    onChange={(event) => void choose(event)}
                    className="sr-only"
                    tabIndex={-1}
                />
                <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => input.current?.click()}
                >
                    {user.avatarUrl ? 'Change photo' : 'Upload photo'}
                </Button>
                {user.avatarUrl && (
                    <Button
                        variant="ghost"
                        size="sm"
                        disabled={removing}
                        onClick={() => void remove()}
                        className="text-muted-foreground"
                    >
                        {removing && <Spinner />}
                        Remove
                    </Button>
                )}
            </div>

            <Separator className="my-4 @4xl:my-5" />

            <dl className="grid grid-cols-2 gap-3 text-sm @4xl:grid-cols-1">
                <div className="flex flex-col gap-0.5 @4xl:flex-row @4xl:items-baseline @4xl:justify-between">
                    <dt className="text-muted-foreground">Member since</dt>
                    <dd className="font-medium">
                        {formatMonthYear(user.createdAt)}
                    </dd>
                </div>
                <div className="flex flex-col gap-0.5 @4xl:flex-row @4xl:items-baseline @4xl:justify-between">
                    <dt className="text-muted-foreground">Funds tracked</dt>
                    <dd className="font-medium tabular-nums">
                        {summary.data ? (
                            summary.data.fundCount
                        ) : (
                            <Skeleton className="h-5 w-6" />
                        )}
                    </dd>
                </div>
            </dl>

            {image && (
                <AvatarDialog image={image} onClose={() => setImage(null)} />
            )}
        </Card>
    );
}
