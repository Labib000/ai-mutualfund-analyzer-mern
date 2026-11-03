import { faWallet } from '@fortawesome/free-solid-svg-icons';

import ComingSoon from '@/components/coming-soon';

export default function Holdings() {
    return (
        <ComingSoon
            title="Portfolio"
            icon={faWallet}
            description="Your funds, SIPs and transactions arrive in Phase 2."
        />
    );
}
