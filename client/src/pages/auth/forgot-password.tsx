import { faCircleNotch } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useState } from 'react';

import { Form } from '@/components/form';
import { Head } from '@/components/head';
import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [sent, setSent] = useState(false);

    if (sent) {
        return (
            <>
                <Head title="Check your email" />

                <div className="space-y-5 text-center" role="status">
                    <div className="space-y-2">
                        <p className="font-medium">Check your email</p>
                        <p className="text-sm text-muted-foreground">
                            If an account exists for{' '}
                            <span className="font-medium break-all text-foreground">
                                {email}
                            </span>
                            , a reset link is on its way. It works for 60
                            minutes. If you don't see it, check your spam
                            folder.
                        </p>
                    </div>

                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                            setEmail('');
                            setSent(false);
                        }}
                    >
                        Use a different email
                    </Button>

                    <div className="space-x-1 text-sm text-muted-foreground">
                        <span>Or, return to</span>
                        <TextLink to="/login">log in</TextLink>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Head title="Forgot password" />

            <div className="space-y-6">
                <Form<{ status: string }>
                    action="/auth/forgot-password"
                    onSuccess={() => setSent(true)}
                >
                    {({ processing, errors }) => (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    name="email"
                                    defaultValue={email}
                                    onChange={(event) =>
                                        setEmail(event.target.value)
                                    }
                                    autoComplete="email"
                                    autoFocus
                                    placeholder="email@example.com"
                                />

                                <InputError message={errors.email} />
                            </div>

                            <div className="my-6 flex items-center justify-start">
                                <Button
                                    className="w-full"
                                    disabled={processing}
                                    data-test="email-password-reset-link-button"
                                >
                                    {processing && (
                                        <FontAwesomeIcon
                                            icon={faCircleNotch}
                                            className="h-4 w-4 animate-spin"
                                        />
                                    )}
                                    Email password reset link
                                </Button>
                            </div>
                        </>
                    )}
                </Form>

                <div className="space-x-1 text-center text-sm text-muted-foreground">
                    <span>Or, return to</span>
                    <TextLink to="/login">log in</TextLink>
                </div>
            </div>
        </>
    );
}
