import type { MessageResponse } from '@hisaab/shared';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Form } from '@/components/form';
import { Head } from '@/components/head';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import {
    SettingsCard,
    SettingsCardBody,
    SettingsCardFooter,
} from '@/components/settings/settings-card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useMe, useUser } from '@/hooks/use-user';
import { ApiError, api } from '@/lib/api';

// Phase 6 adds two-factor authentication and passkeys here.
export default function Security() {
    const passwordRules = useMe().data?.passwordRules;
    const passwordInput = useRef<HTMLInputElement>(null);
    const currentPasswordInput = useRef<HTMLInputElement>(null);

    return (
        <>
            <Head title="Security settings" />

            <SettingsCard
                title="Change password"
                description="Use a long password you don't use anywhere else. Your other devices are signed out when you change it."
            >
                <Form<{ message: string }>
                    action="/settings/password"
                    method="put"
                    resetOnError={[
                        'password',
                        'password_confirmation',
                        'current_password',
                    ]}
                    resetOnSuccess
                    onSuccess={(data) => {
                        toast.success(data.message);
                    }}
                    onError={(errors) => {
                        if (errors.password) {
                            passwordInput.current?.focus();
                        }

                        if (errors.current_password) {
                            currentPasswordInput.current?.focus();
                        }
                    }}
                >
                    {({ errors, processing }) => (
                        <>
                            <SettingsCardBody className="grid gap-5 @xl:grid-cols-2">
                                <div className="grid content-start gap-2 @xl:col-span-2 @xl:max-w-[calc(50%-0.625rem)]">
                                    <Label htmlFor="current_password">
                                        Current password
                                    </Label>
                                    <PasswordInput
                                        id="current_password"
                                        ref={currentPasswordInput}
                                        name="current_password"
                                        autoComplete="current-password"
                                        placeholder="Current password"
                                    />
                                    <InputError
                                        message={errors.current_password}
                                    />
                                </div>

                                <div className="grid content-start gap-2">
                                    <Label htmlFor="password">
                                        New password
                                    </Label>
                                    <PasswordInput
                                        id="password"
                                        ref={passwordInput}
                                        name="password"
                                        autoComplete="new-password"
                                        placeholder="New password"
                                        passwordrules={passwordRules}
                                    />
                                    <InputError message={errors.password} />
                                </div>

                                <div className="grid content-start gap-2">
                                    <Label htmlFor="password_confirmation">
                                        Confirm password
                                    </Label>
                                    <PasswordInput
                                        id="password_confirmation"
                                        name="password_confirmation"
                                        autoComplete="new-password"
                                        placeholder="Confirm password"
                                        passwordrules={passwordRules}
                                    />
                                    <InputError
                                        message={errors.password_confirmation}
                                    />
                                </div>
                            </SettingsCardBody>

                            <SettingsCardFooter>
                                <Button
                                    disabled={processing}
                                    className="w-full sm:w-auto"
                                    data-test="update-password-button"
                                >
                                    {processing && <Spinner />}
                                    Update password
                                </Button>
                            </SettingsCardFooter>
                        </>
                    )}
                </Form>
            </SettingsCard>

            <ResetByEmail />
        </>
    );
}

function ResetByEmail() {
    const { email } = useUser();
    const [sending, setSending] = useState(false);

    const send = async () => {
        setSending(true);

        try {
            const data = await api<MessageResponse>(
                '/settings/password/reset-link',
                { method: 'POST' },
            );
            if (data.warning) toast.warning(data.message);
            else toast.success(data.message);
        } catch (error) {
            toast.error(
                error instanceof ApiError
                    ? error.message
                    : 'Something went wrong. Please try again.',
            );
        } finally {
            setSending(false);
        }
    };

    return (
        <SettingsCard
            title="Forgot your password?"
            description={
                <>
                    We'll email a link to{' '}
                    <span className="font-medium break-all text-foreground">
                        {email}
                    </span>
                    . It works for 60 minutes, and using it signs you out
                    everywhere.
                </>
            }
            action={
                <Button
                    type="button"
                    variant="outline"
                    disabled={sending}
                    onClick={() => void send()}
                    className="w-full shrink-0 @xl:w-auto"
                >
                    {sending && <Spinner />}
                    Email me a reset link
                </Button>
            }
        />
    );
}
