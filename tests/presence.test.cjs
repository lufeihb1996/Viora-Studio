const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

test('presence tracks all visitors silently and reveals online count strictly to xr110', async () => {
  const html = `<!DOCTYPE html><html lang="zh-CN"><body>
    <div id="wrap1" data-online-container style="display:none" class="hidden"><span id="badge1" data-online-label>1 人在线</span></div>
    <div id="wrap2" data-online-container style="display:none" class="hidden"><span id="badge2" data-online-label>1 人在线</span></div>
  </body></html>`;
  const dom = new JSDOM(html, { url: 'http://127.0.0.1:3091/generate.html', runScripts: 'outside-only' });
  const { window } = dom;

  let presenceData = { visitor_a: [{}], visitor_b: [{}], visitor_c: [{}] };
  const handlers = {};
  let authListener = null;
  let trackedPayload = null;

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
      return {
        auth: {
          async getSession() { return { data: { session: null } }; },
          onAuthStateChange(cb) { authListener = cb; return { data: { subscription: {} } }; }
        },
        channel: () => mockChannel,
        removeChannel: () => {}
      };
    }
  };
  window.VioraI18n = { language: 'zh' };

  window.eval(fs.readFileSync('public/assets/presence.js', 'utf8'));
  await new Promise(r => setTimeout(r, 20));

  // 1. Guest still tracks presence silently, but badge stays hidden
  assert.ok(trackedPayload);
  assert.equal(window.VioraPresence.count, 3);
  assert.equal(window.VioraPresence.visible, false);
  assert.equal(window.document.getElementById('wrap1').style.display, 'none');
  assert.ok(window.document.getElementById('wrap1').classList.contains('hidden'));

  // 2. Non-admin user signs in -> still hidden
  authListener('SIGNED_IN', { user: { email: 'otheruser@viora.local.invalid' } });
  assert.equal(window.VioraPresence.visible, false);
  assert.equal(window.document.getElementById('wrap1').style.display, 'none');

  // 3. xr110 signs in -> badge becomes visible with live count 3
  authListener('SIGNED_IN', { user: { email: 'xr110@viora.local.invalid' } });
  assert.equal(window.VioraPresence.visible, true);
  assert.equal(window.document.getElementById('wrap1').style.display, '');
  assert.ok(!window.document.getElementById('wrap1').classList.contains('hidden'));
  assert.equal(window.document.getElementById('badge1').textContent, '3 人在线');

  // 4. Language switch updates visible badge for xr110
  window.VioraI18n.language = 'en';
  window.document.dispatchEvent(new window.CustomEvent('viora-language-change', { detail: 'en' }));
  assert.equal(window.document.getElementById('badge1').textContent, '3 online');

  // 5. xr110 signs out -> immediately hidden again
  authListener('SIGNED_OUT', null);
  assert.equal(window.VioraPresence.visible, false);
  assert.equal(window.document.getElementById('wrap1').style.display, 'none');

  dom.window.close();
});
