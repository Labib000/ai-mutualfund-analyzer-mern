import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

/** Counts from the previous value to the new one; jumps straight there with reduced motion. */
export default function AnimatedNumber({
    value,
    format,
    className,
}: {
    value: number;
    format: (value: number) => string;
    className?: string;
}) {
    const reduce = useReducedMotion();
    const [shown, setShown] = useState(value);
    const from = useRef(value);

    useEffect(() => {
        if (reduce) {
            setShown(value);
            from.current = value;
            return;
        }
        const controls = animate(from.current, value, {
            duration: 0.5,
            ease: [0.22, 1, 0.36, 1],
            onUpdate: (v) => {
                from.current = v;
                setShown(v);
            },
        });
        return () => controls.stop();
    }, [value, reduce]);

    return (
        <span className={className} aria-live="polite">
            {format(shown)}
        </span>
    );
}
