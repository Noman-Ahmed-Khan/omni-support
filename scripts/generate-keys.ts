import crypto from 'crypto';

console.log('\nOmniSupport JWT Key Generator\n');
console.log('Add these to your .env file:\n');

const accessSecret = crypto.randomBytes(64).toString('hex');
const refreshSecret = crypto.randomBytes(64).toString('hex');
const storageSecret = crypto.randomBytes(32).toString('hex');
const webhookSecret = crypto.randomBytes(32).toString('hex');

console.log(`JWT_ACCESS_SECRET=${accessSecret}`);
console.log(`JWT_REFRESH_SECRET=${refreshSecret}`);
console.log(`LOCAL_STORAGE_SECRET=${storageSecret}`);
console.log(`WHATSAPP_WEBHOOK_SECRET=${webhookSecret}`);
console.log('\nKeys generated successfully!\n');