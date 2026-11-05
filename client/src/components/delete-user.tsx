import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Form } from '@/components/form';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import { SettingsCard } from '@/components/settings/settings-card';
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
import { Label } from '@/components/ui/label';
import { ME_KEY } from '@/hooks/use-user';

export default function DeleteUser() {
    const passwordInput = useRef<HTMLInputElement>(null);
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    return (
        <SettingsCard
            title="Delete account"
            description="Permanently removes your account and everything in it. This can't be undone."
            danger
            action={
                <Dialog>
                    <DialogTrigger asChild>
                        <Button
                            variant="outline"
                            className="w-full shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive @xl:w-auto dark:border-destructive/40 dark:hover:bg-destructive/10"
                            data-test="delete-user-button"
                        >
                            Delete account
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader
                            icon={faTriangleExclamation}
                            tone="destructive"
                        >
                            <DialogTitle>
                                Are you sure you want to delete your account?
                            </DialogTitle>
                            <DialogDescription>
                                Your funds, transactions, SIPs and AI history
                                will be permanently deleted. Enter your password
                                to confirm.
                            </DialogDescription>
                        </DialogHeader>

                        <Form
                            action="/settings/profile"
                            method="delete"
                            onSuccess={async () => {
                                queryClient.clear();
                                queryClient.setQueryData(ME_KEY, {
                                    user: null,
                                    passwordRules: '',
                                });
                                toast.success('Your account has been deleted.');
                                await navigate('/');
                            }}
                            onError={() => passwordInput.current?.focus()}
                            resetOnSuccess
                            className="space-y-6"
                        >
                            {({ resetAndClearErrors, processing, errors }) => (
                                <>
                                    <DialogBody className="space-y-4">
                                        <div className="grid gap-2">
                                            <Label
                                                htmlFor="password"
                                                className="sr-only"
                                            >
                                                Password
                                            </Label>

                                            <PasswordInput
                                                id="password"
                                                name="password"
                                                ref={passwordInput}
                                                placeholder="Password"
                                                autoComplete="current-password"
                                            />

                                            <InputError
                                                message={errors.password}
                                            />
                                        </div>
                                    </DialogBody>

                                    <DialogFooter>
                                        <DialogClose asChild>
                                            <Button
                                                variant="secondary"
                                                onClick={() =>
                                                    resetAndClearErrors()
                                                }
                                            >
                                                Cancel
                                            </Button>
                                        </DialogClose>

                                        <Button
                                            variant="destructive"
                                            disabled={processing}
                                            asChild
                                        >
                                            <button
                                                type="submit"
                                                data-test="confirm-delete-user-button"
                                            >
                                                Delete account
                                            </button>
                                        </Button>
                                    </DialogFooter>
                                </>
                            )}
                        </Form>
                    </DialogContent>
                </Dialog>
            }
        />
    );
}
