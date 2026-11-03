import {
    faCircleQuestion,
    faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import type { MessageResponse } from '@hisaab/shared';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { Form } from '@/components/form';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';

/**
 * Asks for confirmation, then sends the request. Rule errors (e.g. "would
 * leave a redemption overdrawn") go to `onError` for the page to show, so the
 * dialog closes either way.
 */
export default function ConfirmDialog({
    action,
    method = 'post',
    title,
    description,
    confirmLabel,
    destructive = true,
    trigger,
    onSuccess,
    onError,
}: {
    /** API path, e.g. "/holdings/1/sips/2/stop". */
    action: string;
    method?: 'post' | 'delete';
    title: string;
    description: string;
    confirmLabel: string;
    destructive?: boolean;
    trigger: ReactNode;
    onSuccess?: (data: MessageResponse) => void | Promise<void>;
    onError?: (errors: string[]) => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent>
                <DialogHeader
                    icon={
                        destructive ? faTriangleExclamation : faCircleQuestion
                    }
                    tone={destructive ? 'destructive' : 'default'}
                    className="pb-5"
                >
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>

                <Form<MessageResponse>
                    action={action}
                    method={method}
                    onSuccess={async (data) => {
                        setOpen(false);
                        await onSuccess?.(data);
                    }}
                    onError={(errors) => {
                        setOpen(false);
                        onError?.(
                            Object.values(errors).filter(
                                (e): e is string => !!e,
                            ),
                        );
                    }}
                >
                    {({ processing }) => (
                        <DialogFooter>
                            <DialogClose asChild>
                                <Button type="button" variant="secondary">
                                    Cancel
                                </Button>
                            </DialogClose>
                            <Button
                                type="submit"
                                variant={
                                    destructive ? 'destructive' : 'default'
                                }
                                disabled={processing}
                            >
                                {confirmLabel}
                            </Button>
                        </DialogFooter>
                    )}
                </Form>
            </DialogContent>
        </Dialog>
    );
}
