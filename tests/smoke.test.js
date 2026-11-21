const test = require('node:test');
const assert = require('node:assert');
const app = require('../server.js');

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    // Bind to dynamic ephemeral port on 127.0.0.1
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /health returns HTTP 200 with ok status and service identity', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.status, 'ok');
  assert.strictEqual(data.service, 'MediTrack');
  assert.ok(data.timestamp);
  assert.ok(!isNaN(Date.parse(data.timestamp)));
});

test('GET / serves the MediTrack Senior-Care Accessible Console', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('MediTrack'));
  assert.ok(html.includes('Atkinson Hyperlegible'));
  assert.ok(html.includes('Today\'s Medicine Schedule'));
  assert.ok(html.includes('Smart AI Prescription &amp; Voice Scanner') || html.includes('Smart AI Prescription & Voice Scanner'));
});

test('POST /api/parse-prescription returns HTTP 400 when no image or text is supplied', async () => {
  const res = await fetch(`${baseUrl}/api/parse-prescription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.ok(data.error.includes('prescription photo') || data.error.includes('written/voice'));
});

test('POST /api/care-check returns HTTP 400 when medicines array is empty or missing', async () => {
  const res = await fetch(`${baseUrl}/api/care-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ medicines: [] })
  });
  assert.strictEqual(res.status, 400);
  const data = await res.json();
  assert.strictEqual(data.success, false);
  assert.ok(data.error.includes('non-empty array'));
});
