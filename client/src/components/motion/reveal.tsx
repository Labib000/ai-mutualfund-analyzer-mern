import { motion } from 'motion/react';
import type { HTMLMotionProps, Variants } from 'motion/react';

const container: Variants = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } },
};

const item: Variants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { type: 'spring', stiffness: 260, damping: 26 },
    },
};

/**
 * Reveals its <Reveal> children one after another when it mounts.
 */
export function Stagger(props: HTMLMotionProps<'div'>) {
    return (
        <motion.div
            variants={container}
            initial="hidden"
            animate="visible"
            {...props}
        />
    );
}

/**
 * Fades in and rises into place, timed by the nearest <Stagger>.
 */
export function Reveal(props: HTMLMotionProps<'div'>) {
    return <motion.div variants={item} {...props} />;
}
