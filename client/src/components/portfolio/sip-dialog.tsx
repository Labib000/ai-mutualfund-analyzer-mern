import { faRepeat } from '@fortawesome/free-solid-svg-icons';
import type { MessageResponse, SipJson } from '@hisaab/shared';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { Form } from '@/components/form';
import FormField from '@/components/portfolio/form-field';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogBody,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { usePortfolioChanged } from '@/hooks/use-portfolio';
import { paiseToRupeeInput } from '@/lib/format';

/**
 * Create a SIP, or edit one when `sip` is given. Editing changes only future installments.
 */
export default function SipDialog({
    holdingId,
    today,
    sip,
    trigger,
}: {
    holdingId: string;
    today: string;
    sip?: SipJson;
    trigger: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const changed = usePortfolioChanged();

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>{trigger}</DialogTrigger>
            <DialogContent>
                <DialogHeader icon={faRepeat}>
                    <DialogTitle>{sip ? 'Edit SIP' : 'Add a SIP'}</DialogTitle>
                    <DialogDescription>
                        {sip
                            ? 'Changes apply to future installments only. Installments already recorded stay as they are.'
                            : 'Past installments are recorded straight away. New ones are added automatically once each NAV is published.'}
                    </DialogDescription>
                </DialogHeader>

                <Form<MessageResponse>
                    action={
                        sip
                            ? `/holdings/${holdingId}/sips/${sip.id}`
                            : `/holdings/${holdingId}/sips`
                    }
                    method={sip ? 'patch' : 'post'}
                    onSuccess={async (data) => {
                        setOpen(false);
                        await changed(data);
                    }}
                    resetOnSuccess={!sip}
                    className="flex min-h-0 flex-1 flex-col"
                >
                    {({ processing, errors }) => (
                        <>
                            <DialogBody className="space-y-4">
                                <FormField
                                    id="sip-amount"
                                    label="Monthly amount (₹)"
                                    error={errors.amount}
                                >
                                    <Input
                                        id="sip-amount"
                                        name="amount"
                                        inputMode="decimal"
                                        placeholder="5000"
                                        defaultValue={
                                            sip
                                                ? paiseToRupeeInput(
                                                      sip.amountPaise,
                                                  )
                                                : undefined
                                        }
                                        required
                                    />
                                </FormField>

                                <FormField
                                    id="sip-day"
                                    label="Day of the month"
                                    hint="Days 29–31 fall on the last day of shorter months."
                                    error={errors.day_of_month}
                                >
                                    <Input
                                        id="sip-day"
                                        name="day_of_month"
                                        type="number"
                                        min={1}
                                        max={31}
                                        defaultValue={sip?.dayOfMonth ?? 5}
                                        required
                                    />
                                </FormField>

                                {!sip && (
                                    <FormField
                                        id="sip-start"
                                        label="Start date"
                                        error={errors.start_date}
                                    >
                                        <Input
                                            id="sip-start"
                                            name="start_date"
                                            type="date"
                                            defaultValue={today}
                                            required
                                        />
                                    </FormField>
                                )}

                                <FormField
                                    id="sip-end"
                                    label="End date (optional)"
                                    error={errors.end_date}
                                >
                                    <Input
                                        id="sip-end"
                                        name="end_date"
                                        type="date"
                                        min={sip?.earliestEndDate}
                                        defaultValue={sip?.endDate ?? undefined}
                                    />
                                </FormField>
                            </DialogBody>

                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button type="button" variant="secondary">
                                        Cancel
                                    </Button>
                                </DialogClose>
                                <Button type="submit" disabled={processing}>
                                    {sip ? 'Save changes' : 'Save SIP'}
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </Form>
            </DialogContent>
        </Dialog>
    );
}
