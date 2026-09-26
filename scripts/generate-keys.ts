import crypto from 'crypto';

console.log('\nOmniSupport Secret Generator\n');
console.log('Add these to your .env file:\n');

console.log(`JWT_ACCESS_SECRET=${crypto.randomBytes(64).toString('hex')}`);
console.log(`JWT_REFRESH_SECRET=${crypto.randomBytes(64).toString('hex')}`);
console.log(`ENCRYPTION_KEY=${crypto.randomBytes(32).toString('hex')}`);
console.log(`LOCAL_STORAGE_SECRET=${crypto.randomBytes(32).toString('hex')}`);
console.log('\nKeys generated successfully!\n');
