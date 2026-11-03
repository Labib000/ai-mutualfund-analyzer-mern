/**
 * Development seed, like Laravel's DatabaseSeeder: a verified demo user.
 *   npm run db:seed
 * Re-running resets the demo user's password and verification.
 * Refuses to run in production.
 */
import { hashPassword } from '../auth/password.js';
import { ConfigError, loadConfig } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { now } from '../lib/today.js';
import { User } from '../models/user.js';

export const DEMO_USER = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password',
};

async function main(): Promise<void> {
    let config;
    try {
        config = loadConfig();
    } catch (error) {
        if (error instanceof ConfigError) {
            console.error(error.message);
            process.exit(1);
        }
        throw error;
    }

    if (config.NODE_ENV === 'production') {
        console.error('Refusing to seed a demo user in production.');
        process.exit(1);
    }

    const connection = await connectDb(config.MONGODB_URI);

    const user = await User.findOneAndUpdate(
        { email: DEMO_USER.email },
        {
            name: DEMO_USER.name,
            passwordHash: await hashPassword(DEMO_USER.password),
            emailVerifiedAt: now(),
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    );

    console.log(
        `Demo user ready in database "${connection.connection.name}":\n` +
            `  email:    ${user.email}\n` +
            `  password: ${DEMO_USER.password}`,
    );

    await disconnectDb();
}

void main();
