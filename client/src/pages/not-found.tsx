import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

export default function NotFound() {
    return (
        <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
            <h1 className="text-2xl font-semibold">Page not found</h1>
            <p className="text-muted-foreground">That page doesn't exist.</p>
            <Button asChild variant="outline">
                <Link to="/">Go home</Link>
            </Button>
        </main>
    );
}
