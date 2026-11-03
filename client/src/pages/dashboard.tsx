import { faChartPie } from '@fortawesome/free-solid-svg-icons';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';

import ComingSoon from '@/components/coming-soon';

export default function Dashboard() {
    const [params, setParams] = useSearchParams();

    // Arrived from the email verification link.
    useEffect(() => {
        if (params.get('verified') === '1') {
            toast.success('Your email address has been verified.');
            setParams({}, { replace: true });
        }
    }, [params, setParams]);

    return (
        <ComingSoon
            title="Dashboard"
            icon={faChartPie}
            description="Your portfolio summary, value chart and allocation arrive in Phase 2."
        />
    );
}
