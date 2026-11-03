import type { User } from '@hisaab/shared';
import { useState } from 'react';
import { toast } from 'sonner';

import DeleteUser from '@/components/delete-user';
import { Form } from '@/components/form';
import { Head } from '@/components/head';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { textLinkClass } from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSetUser, useUser } from '@/hooks/use-user';
import { api } from '@/lib/api';

export default function Profile() {
    const user = useUser();
    const setUser = useSetUser();
    const [status, setStatus] = useState<string>();

    const resendVerification = async () => {
        const data = await api<{ status: string }>(
            '/auth/email/verification-notification',
            {
                method: 'POST',
            },
        ).catch(() => undefined);
        setStatus(data?.status);
    };

    return (
        <>
            <Head title="Profile settings" />

            <h1 className="sr-only">Profile settings</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title="Profile"
                    description="Update your name and email address"
                />

                <Form<{ user: User; message: string }>
                    action="/settings/profile"
                    method="patch"
                    onSuccess={(data) => {
                        setUser(data.user);
                        toast.success(data.message);
                    }}
                    className="space-y-6"
                >
                    {({ processing, errors }) => (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="name">Name</Label>

                                <Input
                                    id="name"
                                    className="mt-1 block w-full"
                                    defaultValue={user.name}
                                    name="name"
                                    required
                                    autoComplete="name"
                                    placeholder="Full name"
                                />

                                <InputError
                                    className="mt-2"
                                    message={errors.name}
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="email">Email address</Label>

                                <Input
                                    id="email"
                                    type="email"
                                    className="mt-1 block w-full"
                                    defaultValue={user.email}
                                    name="email"
                                    required
                                    autoComplete="username"
                                    placeholder="Email address"
                                />

                                <InputError
                                    className="mt-2"
                                    message={errors.email}
                                />
                            </div>

                            {user.emailVerifiedAt === null && (
                                <div>
                                    <p className="-mt-4 text-sm text-muted-foreground">
                                        Your email address is unverified.{' '}
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void resendVerification()
                                            }
                                            className={textLinkClass}
                                        >
                                            Click here to re-send the
                                            verification email.
                                        </button>
                                    </p>

                                    {status === 'verification-link-sent' && (
                                        <div className="mt-2 text-sm font-medium text-green-600">
                                            A new verification link has been
                                            sent to your email address.
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center gap-4">
                                <Button
                                    disabled={processing}
                                    data-test="update-profile-button"
                                >
                                    Save
                                </Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>

            {user.emailVerifiedAt !== null && <DeleteUser />}
        </>
    );
}
