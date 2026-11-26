const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

test('presence module tracks live online count and updates badges across language switches', async () => {
  const html = `<!DOCTYPE html><html lang="zh-CN"><body>
    <span id="badge1" data-online-label>1 人在线</span>
    <span id="badge2" data-online-label>1 人在线</span>
  </body></html>`;
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:3091/generate.html', runScripts: 'outside-only' });
  const { window } = dom;

  let presenceData = { visitor_a: [{}] };
  const handlers = {};
  let trackedPayload = null;
  let createClientCalls = 0;

  const mockChannel = {
    state: 'joined',
    on(type, filter, cb) {
      if (type === 'presence' && filter?.event) handlers[filter.event] = cb;
      return mockChannel;
    },
    subscribe(cb) {
      Promise.resolve().then(() => cb('SUBSCRIBED'));
      return mockChannel;
    },
    async track(payload) {
      trackedPayload = payload;
      return 'ok';
    },
    presenceState() {
      return presenceData;
    }
  };

  window.MOSS_SUPABASE = { url: 'https://example.supabase.co', key: 'sb_publishable_test' };
  window.supabase = {
    createClient() {
      createClientCalls++;
      return {
        channel: () => mockChannel,
        removeChannel: () => {}
      };
    }
  };
  window.VioraI18n = { language: 'zh' };

  window.eval(fs.readFileSync('public/assets/presence.js', 'utf8'));
  await new Promise(r => setTimeout(r, 20));

  assert.equal(createClientCalls, 1);
  assert.ok(trackedPayload);
  assert.equal(trackedPayload.page, '/generate.html');
  assert.equal(window.document.getElementById('badge1').textContent, '1 人在线');

  // Simulate 3 concurrent visitors joining on X
  presenceData = { visitor_a: [{}], visitor_b: [{}], visitor_c: [{}] };
  handlers.sync();
  assert.equal(window.VioraPresence.count, 3);
  assert.equal(window.document.getElementById('badge1').textContent, '3 人在线');
  assert.equal(window.document.getElementById('badge2').textContent, '3 人在线');

  // Switch language to English
  window.VioraI18n.language = 'en';
  window.document.dispatchEvent(new window.CustomEvent('viora-language-change', { detail: 'en' }));
  assert.equal(window.document.getElementById('badge1').textContent, '3 online');

  dom.window.close();
});
