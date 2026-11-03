import { faCartPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { MessageResponse } from '@hisaab/shared';
import { useState } from 'react';

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

export default function PurchaseDialog({
    holdingId,
    today,
}: {
    holdingId: string;
    today: string;
}) {
    const [open, setOpen] = useState(false);
    const changed = usePortfolioChanged();

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="w-full sm:w-auto">
                    <FontAwesomeIcon icon={faCartPlus} />
                    <span className="sm:hidden">Buy</span>
                    <span className="hidden sm:inline">Add purchase</span>
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader icon={faCartPlus}>
                    <DialogTitle>Add a lump-sum purchase</DialogTitle>
                    <DialogDescription>
                        Units are worked out from the NAV of that day (the next
                        business day for weekends and holidays), after 0.005%
                        stamp duty.
                    </DialogDescription>
                </DialogHeader>

                <Form<MessageResponse>
                    action={`/holdings/${holdingId}/purchases`}
                    onSuccess={async (data) => {
                        setOpen(false);
                        await changed(data);
                    }}
                    resetOnSuccess
                    className="flex min-h-0 flex-1 flex-col"
                >
                    {({ processing, errors }) => (
                        <>
                            <DialogBody className="space-y-4">
                                <FormField
                                    id="purchase-date"
                                    label="Date"
                                    error={errors.txn_date}
                                >
                                    <Input
                                        id="purchase-date"
                                        name="txn_date"
                                        type="date"
                                        max={today}
                                        defaultValue={today}
                                        required
                                    />
                                </FormField>

                                <FormField
                                    id="purchase-amount"
                                    label="Amount invested (₹)"
                                    error={errors.amount}
                                >
                                    <Input
                                        id="purchase-amount"
                                        name="amount"
                                        inputMode="decimal"
                                        placeholder="10000"
                                        required
                                    />
                                </FormField>

                                <FormField
                                    id="purchase-units"
                                    label="Units (optional)"
                                    hint="Only if your statement shows a different number of units."
                                    error={errors.units}
                                >
                                    <Input
                                        id="purchase-units"
                                        name="units"
                                        inputMode="decimal"
                                        placeholder="Calculated automatically"
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
                                    Save purchase
                                </Button>
                            </DialogFooter>
                        </>
                    )}
                </Form>
            </DialogContent>
        </Dialog>
    );
}
