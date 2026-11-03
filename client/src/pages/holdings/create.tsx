import { faPlus } from '@fortawesome/free-solid-svg-icons';

import ComingSoon from '@/components/coming-soon';

export default function CreateHolding() {
    return (
        <ComingSoon
            title="Add fund"
            icon={faPlus}
            description="Scheme search and adding funds arrive in Phase 2."
        />
    );
}
