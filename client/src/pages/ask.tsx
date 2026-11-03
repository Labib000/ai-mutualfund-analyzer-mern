import { faComments } from '@fortawesome/free-solid-svg-icons';

import ComingSoon from '@/components/coming-soon';

export default function Ask() {
    return (
        <ComingSoon
            title="Ask AI"
            icon={faComments}
            description="Plain-language answers about your own portfolio arrive in Phase 4."
        />
    );
}
