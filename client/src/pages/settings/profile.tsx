import type { User } from '@hisaab/shared';
import { useState } from 'react';
import { toast } from 'sonner';

import DeleteUser from '@/components/delete-user';
import { Form } from '@/components/form';
import { Head } from '@/components/head';
import InputError from '@/components/input-error';
import {
    SettingsCard,
    SettingsCardBody,
    SettingsCardFooter,
} from '@/components/settings/settings-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useSetUser, useUser } from '@/hooks/use-user';
import { ApiError, api } from '@/lib/api';

export default function Profile() {
    const user = useUser();
    const setUser = useSetUser();
    const [email, setEmail] = useState(user.email);
    const emailChanged = email.trim().toLowerCase() !== user.email;
    const verified = user.emailVerifiedAt !== null;

    return (
        <>
            <Head title="Profile settings" />

            <SettingsCard
                title="Personal details"
                description="Your name appears across Hisaab. Your email is how you sign in."
            >
                <Form<{ user: User; message: string }>
                    action="/settings/profile"
                    method="patch"
                    onSuccess={(data) => {
                        setUser(data.user);
                        setEmail(data.user.email);
                        toast.success(data.message);
                    }}
                >
                    {({ processing, errors }) => (
                        <>
                            <SettingsCardBody className="space-y-5">
                                {!verified && <VerifyNotice />}

                                <div className="grid gap-5 @xl:grid-cols-2">
                                    <div className="grid content-start gap-2">
                                        <Label htmlFor="name">Name</Label>
                                        <Input
                                            id="name"
                                            defaultValue={user.name}
                                            name="name"
                                            required
                                            autoComplete="name"
                                            placeholder="Full name"
                                        />
                                        <InputError message={errors.name} />
                                    </div>

                                    <div className="grid content-start gap-2">
                                        <Label htmlFor="email">
                                            Email address
                                        </Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            defaultValue={user.email}
                                            onChange={(event) =>
                                                setEmail(event.target.value)
                                            }
                                            name="email"
                                            required
                                            autoComplete="username"
                                            placeholder="Email address"
                                        />
                                        <InputError message={errors.email} />
                                    </div>
                                </div>

                                {emailChanged && (
                                    <p className="text-sm text-muted-foreground">
                                        We'll send a link to the new address to
                                        verify it. Your portfolio is unavailable
                                        until you do.
                                    </p>
                                )}
                            </SettingsCardBody>

                            <SettingsCardFooter>
                                <Button
                                    disabled={processing}
                                    className="w-full sm:w-auto"
                                    data-test="update-profile-button"
                                >
                                    {processing && <Spinner />}
                                    Save changes
                                </Button>
                            </SettingsCardFooter>
                        </>
                    )}
                </Form>
            </SettingsCard>

            {verified && <DeleteUser />}
        </>
    );
}

function VerifyNotice() {
    const [sending, setSending] = useState(false);

    const resend = async () => {
        setSending(true);

        try {
            await api('/auth/email/verification-notification', {
                method: 'POST',
            });
            toast.success('A new verification link is on its way.');
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
        <Alert>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                    Your email address isn't verified yet. Check your inbox for
                    the link.
                </span>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={sending}
                    onClick={() => void resend()}
                    className="w-full shrink-0 sm:w-auto"
                >
                    {sending && <Spinner />}
                    Resend link
                </Button>
            </AlertDescription>
        </Alert>
    );
}
