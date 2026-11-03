import { useEffect } from 'react';

const APP_NAME = 'Hisaab';

/** Sets the document title like Inertia's <Head> ("Title - Hisaab"). */
export function Head({ title }: { title?: string }) {
    useEffect(() => {
        document.title = title ? `${title} - ${APP_NAME}` : APP_NAME;
    }, [title]);

    return null;
}
