import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
    faCheck,
    faDesktop,
    faMoon,
    faSun,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Appearance } from '@/hooks/use-appearance';
import { useAppearance } from '@/hooks/use-appearance';

const options: { value: Appearance; icon: IconDefinition; label: string }[] = [
    { value: 'light', icon: faSun, label: 'Light' },
    { value: 'dark', icon: faMoon, label: 'Dark' },
    { value: 'system', icon: faDesktop, label: 'System' },
];

/**
 * Header button for switching between light, dark and system themes.
 */
export default function AppearanceDropdown() {
    const { appearance, resolvedAppearance, updateAppearance } =
        useAppearance();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="size-10 rounded-full md:size-9"
                    aria-label="Change theme"
                >
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.span
                            key={resolvedAppearance}
                            initial={{ rotate: -90, scale: 0.5, opacity: 0 }}
                            animate={{ rotate: 0, scale: 1, opacity: 1 }}
                            exit={{ rotate: 90, scale: 0.5, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex"
                        >
                            <FontAwesomeIcon
                                icon={
                                    resolvedAppearance === 'dark'
                                        ? faMoon
                                        : faSun
                                }
                            />
                        </motion.span>
                    </AnimatePresence>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-36">
                {options.map((option) => (
                    <DropdownMenuItem
                        key={option.value}
                        onSelect={() => updateAppearance(option.value)}
                    >
                        <FontAwesomeIcon icon={option.icon} fixedWidth />
                        {option.label}
                        {appearance === option.value && (
                            <FontAwesomeIcon
                                icon={faCheck}
                                className="ml-auto"
                            />
                        )}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
