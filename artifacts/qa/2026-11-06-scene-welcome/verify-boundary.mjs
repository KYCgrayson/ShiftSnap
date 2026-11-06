import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

const [imagePath, trafficPath] = process.argv.slice(2);
const original = readFileSync(imagePath);
const expected = {bytes: original.length, sha256: createHash('sha256').update(original).digest('hex')};
const {requests} = JSON.parse(readFileSync(trafficPath, 'utf8'));
const group = '00000000-0000-4000-8000-000000000010';
const only = (method, matchesPath) => {
  const results = requests.filter(r => r.method === method && matchesPath(r.path));
  assert.equal(results.length, 1, 'Expected exactly one ' + method + ' matching request');
  return results[0];
};
const ocr = only('POST', path => path === '/functions/v1/ocr-process');
const schedule = only('POST', path => path === '/rest/v1/schedules');
assert.equal(schedule.body.group_id, group);
const upload = only('POST', path => path.startsWith('/storage/v1/object/shift-images/') && path.includes('/' + group + '/'));
const download = only('GET', path => path === upload.path || path.replace('/object/authenticated/', '/object/') === upload.path);
for (const request of [ocr, upload, download]) assert.deepEqual(request.body, expected);
const saved = only('PATCH', path => path === '/rest/v1/schedules');
assert.equal(saved.body.image_status, 'uploaded');
console.log(JSON.stringify({group, ocrMatchesOriginal: true, uploadMatchesOriginal: true, downloadMatchesOriginal: true, savedStatus: saved.body.image_status, ...expected}));
