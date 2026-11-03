import type { User } from '@hisaab/shared';
import { useLocation, useNavigate, useSearchParams } from 'react-router';

import { Form } from '@/components/form';
import { Head } from '@/components/head';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useSetUser } from '@/hooks/use-user';
import { safeNext } from '@/lib/safe-next';

export default function Login() {
    const [params] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const setUser = useSetUser();
    const status = (location.state as { status?: string } | null)?.status;

    const onSuccess = async ({ user }: { user: User }) => {
        setUser(user);
        const next = safeNext(params.get('next'));

        // e.g. the email verification link, which is a server route.
        if (next.startsWith('/api/')) {
            window.location.assign(next);
            return;
        }

        await navigate(next, { replace: true });
    };

    return (
        <>
            <Head title="Log in" />

            <Form<{ user: User }>
                action="/auth/login"
                resetOnSuccess={['password']}
                onSuccess={onSuccess}
                className="flex flex-col gap-6"
            >
                {({ processing, errors }) => (
                    <>
                        <div className="grid gap-6">
                            <div className="grid gap-2">
                                <Label htmlFor="email">Email address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    name="email"
                                    required
                                    autoFocus
                                    tabIndex={1}
                                    autoComplete="email"
                                    placeholder="email@example.com"
                                />
                                <InputError message={errors.email} />
                            </div>

                            <div className="grid gap-2">
                                <div className="flex items-center">
                                    <Label htmlFor="password">Password</Label>
                                    <TextLink
                                        to="/forgot-password"
                                        className="ml-auto text-sm"
                                        tabIndex={5}
                                    >
                                        Forgot your password?
                                    </TextLink>
                                </div>
                                <PasswordInput
                                    id="password"
                                    name="password"
                                    required
                                    tabIndex={2}
                                    autoComplete="current-password"
                                    placeholder="Password"
                                />
                                <InputError message={errors.password} />
                            </div>

                            <div className="flex items-center space-x-3">
                                <Checkbox
                                    id="remember"
                                    name="remember"
                                    tabIndex={3}
                                />
                                <Label htmlFor="remember">Remember me</Label>
                            </div>

                            <Button
                                type="submit"
                                className="mt-4 w-full"
                                tabIndex={4}
                                disabled={processing}
                                data-test="login-button"
                            >
                                {processing && <Spinner />}
                                Log in
                            </Button>
                        </div>

                        <div className="text-center text-sm text-muted-foreground">
                            Don't have an account?{' '}
                            <TextLink to="/register" tabIndex={5}>
                                Sign up
                            </TextLink>
                        </div>
                    </>
                )}
            </Form>

            {status && (
                <div className="mt-4 text-center text-sm font-medium text-green-600">
                    {status}
                </div>
            )}
        </>
    );
}
