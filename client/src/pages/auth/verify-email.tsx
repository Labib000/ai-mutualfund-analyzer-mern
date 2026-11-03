import { useState } from 'react';

import { Form } from '@/components/form';
import { Head } from '@/components/head';
import { textLinkClass } from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useLogout } from '@/hooks/use-logout';
import { cn } from '@/lib/utils';

export default function VerifyEmail() {
    const [status, setStatus] = useState<string>();
    const logout = useLogout();

    return (
        <>
            <Head title="Email verification" />

            {status === 'verification-link-sent' && (
                <div className="mb-4 text-center text-sm font-medium text-green-600">
                    A new verification link has been sent to the email address
                    you provided during registration.
                </div>
            )}

            <Form<{ status: string }>
                action="/auth/email/verification-notification"
                onSuccess={(data) => setStatus(data.status)}
                className="space-y-6 text-center"
            >
                {({ processing }) => (
                    <>
                        <Button disabled={processing} variant="secondary">
                            {processing && <Spinner />}
                            Resend verification email
                        </Button>

                        <button
                            type="button"
                            onClick={() => void logout()}
                            className={cn(
                                textLinkClass,
                                'mx-auto block text-sm',
                            )}
                        >
                            Log out
                        </button>
                    </>
                )}
            </Form>
        </>
    );
}
