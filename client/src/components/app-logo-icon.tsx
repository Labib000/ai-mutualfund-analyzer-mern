import { useId } from 'react';
import type { SVGAttributes } from 'react';

/**
 * The Hisaab mark: a teal tile with two white bars and an amber slash.
 * Same artwork as public/webAssets/hisaab-icon.svg.
 */
export default function AppLogoIcon(props: SVGAttributes<SVGElement>) {
    const gradientId = `hisaab-mark-${useId().replace(/:/g, '')}`;

    return (
        <svg
            viewBox="0 0 512 512"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            {...props}
        >
            <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#0E9384" />
                    <stop offset="1" stopColor="#086256" />
                </linearGradient>
            </defs>
            <rect
                width="512"
                height="512"
                rx="116"
                fill={`url(#${gradientId})`}
            />
            <polygon
                points="182,303.79 330,210.21 330,272.21 182,365.79"
                fill="#FFC247"
            />
            <rect
                x="104"
                y="184"
                width="84"
                height="208"
                rx="42"
                fill="#FFFFFF"
            />
            <rect
                x="324"
                y="120"
                width="84"
                height="272"
                rx="42"
                fill="#FFFFFF"
            />
        </svg>
    );
}
