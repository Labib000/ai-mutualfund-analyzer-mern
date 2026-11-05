import { Head } from '@/components/head';
import {
    SettingsCard,
    SettingsCardBody,
} from '@/components/settings/settings-card';
import ThemePicker from '@/components/settings/theme-picker';

export default function Appearance() {
    return (
        <>
            <Head title="Appearance settings" />

            <SettingsCard
                title="Theme"
                description="Choose how Hisaab looks on this device. System follows your device's setting."
            >
                <SettingsCardBody>
                    <ThemePicker />
                </SettingsCardBody>
            </SettingsCard>
        </>
    );
}
