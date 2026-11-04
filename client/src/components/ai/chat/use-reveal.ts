import { useReducedMotion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';

import { revealCount, revealTokens } from '@/lib/reveal';

/**
 * Shows `text` word by word, like a streamed answer. Off when `enabled` is
 * false or the user prefers reduced motion.
 */
export function useReveal(text: string, enabled: boolean) {
    const reduce = useReducedMotion();
    const tokens = useMemo(() => revealTokens(text), [text]);
    const animate = enabled && !reduce;
    const [count, setCount] = useState(animate ? 0 : tokens.length);

    useEffect(() => {
        if (!animate) {
            setCount(tokens.length);
            return;
        }
        let frame = 0;
        const start = performance.now();
        const tick = (now: number) => {
            const shown = revealCount(tokens.length, now - start);
            setCount(shown);
            if (shown < tokens.length) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [animate, tokens]);

    return {
        shown: count >= tokens.length ? text : tokens.slice(0, count).join(''),
        done: count >= tokens.length,
    };
}
