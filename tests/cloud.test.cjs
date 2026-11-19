const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');

function setup() {
  const state = { rows: [], objects: new Map(), failUpload: false };
  const storage = {
    async upload(path, blob) { if (state.failUpload) return { error: new Error('storage unavailable') }; state.objects.set(path, blob); return { error: null }; },
    async createSignedUrl(path) { return { data: { signedUrl: 'https://example.test/signed/' + path }, error: null }; },
    async remove(paths) { for (const path of paths) state.objects.delete(path); return { error: null }; }
  };
  const db = {
    select() { return { order() { return { async limit() { return { data: state.rows, error: null }; } }; }, eq(field, value) { return { async single() { return { data: state.rows.find(row => row[field] === value), error: null }; } }; } }; },
    async upsert(row) { state.rows = [{ ...row, id: 'row-id' }]; return { error: null }; },
    delete() { return { async eq(field, value) { state.rows = state.rows.filter(row => row[field] !== value); return { error: null }; } }; }
  };
  const client = { auth: {}, from: () => db, storage: { from: () => storage } };
  const context = vm.createContext({ window: { supabase: { createClient: () => client }, MOSS_SUPABASE: { url: 'https://example.test', key: 'test' } }, crypto: webcrypto, TextEncoder, fetch: async () => ({ ok: true, blob: async () => new Blob(['image'], { type: 'image/png' }) }), console });
  vm.runInContext(fs.readFileSync('public/assets/cloud.js', 'utf8'), context);
  vm.runInContext("cloudUser = { id: 'test-user' }", context);
  return { context, state };
}
const job = { prompt_id: 'task-1', prompt: 'test prompt', aspect_ratio: '1:1', width: 1024, height: 1024, steps: 35, cfg: 2.8, seed: 42 };
test('saves image and metadata to account-specific storage, lists signed image, deletes both', async () => {
  const { context, state } = setup();
  await context.cloudSave(job, { media_url: '/image.png' });
  assert.equal(state.rows.length, 1);
  assert.equal(state.rows[0].user_id, 'test-user');
  assert.match(state.rows[0].storage_path, /^test-user\/[0-9a-f]{64}\.png$/);
  assert.equal(state.objects.size, 1);
  assert.match((await context.cloudList())[0].media_url, /^https:\/\/example.test\/signed\//);
  await context.cloudDelete('row-id');
  assert.equal(state.rows.length, 0);
  assert.equal(state.objects.size, 0);
});
test('does not write history when storage upload fails', async () => {
  const { context, state } = setup();
  state.failUpload = true;
  await assert.rejects(context.cloudSave(job, { media_url: '/image.png' }), /storage unavailable/);
  assert.equal(state.rows.length, 0);
});
test('uses batch createSignedUrls, caches signed URLs, and supports batch deletion', async () => {
  const state = {
    rows: [
      { id: 'id-1', storage_path: 'test-user/a.png' },
      { id: 'id-2', storage_path: 'test-user/b.png' },
    ],
    objects: new Map([['test-user/a.png', 'a'], ['test-user/b.png', 'b']]),
    batchSignCalls: 0,
  };
  const storage = {
    async createSignedUrls(paths) {
      state.batchSignCalls++;
      return { data: paths.map(p => ({ path: p, signedUrl: 'https://example.test/batch/' + p })), error: null };
    },
    async remove(paths) { for (const p of paths) state.objects.delete(p); return { error: null }; }
  };
  const db = {
    select() {
      return {
        order() { return { async limit() { return { data: state.rows, error: null }; } }; },
        async in(field, values) { return { data: state.rows.filter(r => values.includes(r[field])), error: null }; },
      };
    },
    delete() {
      return {
        async in(field, values) { state.rows = state.rows.filter(r => !values.includes(r[field])); return { error: null }; }
      };
    }
  };
  const client = { auth: {}, from: () => db, storage: { from: () => storage } };
  const context = vm.createContext({ window: { supabase: { createClient: () => client }, MOSS_SUPABASE: { url: 'https://example.test', key: 'test' } }, crypto: webcrypto, TextEncoder, console });
  vm.runInContext(fs.readFileSync('public/assets/cloud.js', 'utf8'), context);
  vm.runInContext("cloudUser = { id: 'test-user' }", context);

  const first = await context.cloudList();
  assert.equal(first.length, 2);
  assert.equal(state.batchSignCalls, 1);
  // Second list should hit the in-memory signed URL cache (0 extra signing calls)
  const second = await context.cloudList();
  assert.equal(second.length, 2);
  assert.equal(state.batchSignCalls, 1);

  const deleted = await context.cloudBatchDelete(['id-1', 'id-2']);
  assert.equal(deleted, 2);
  assert.equal(state.rows.length, 0);
  assert.equal(state.objects.size, 0);

  state.rows.push(
    { id: 'id-3', storage_path: 'test-user/c.png' },
    { id: 'id-4', storage_path: 'test-user/d.png' },
  );
  state.objects.set('test-user/c.png', 'c');
  state.objects.set('test-user/d.png', 'd');
  const cleared = await context.cloudClearAll();
  assert.equal(cleared, 2);
  assert.equal(state.rows.length, 0);
  assert.equal(state.objects.size, 0);
});
