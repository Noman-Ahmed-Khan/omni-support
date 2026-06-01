import http from 'http';

const PORT = process.env.PORT ?? 3000;
const HOST = process.env.HOST ?? 'localhost';

const options = {
  hostname: HOST,
  port: PORT,
  path: '/health/live',
  method: 'GET',
  timeout: 5000,
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    console.log('Health check passed');
    process.exit(0);
  } else {
    console.error(`Health check failed: HTTP ${res.statusCode}`);
    process.exit(1);
  }
});

req.on('error', (err) => {
  console.error(`Health check failed: ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  console.error('Health check timed out');
  process.exit(1);
});

req.end();