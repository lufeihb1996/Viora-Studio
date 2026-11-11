const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const script = fs.readFileSync('public/assets/i18n.js', 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function page(file, savedLanguage) {
  const dom = new JSDOM(fs.readFileSync(file,'utf8'), { url: 'http://127.0.0.1:3091/', runScripts:'outside-only' });
  if (savedLanguage) dom.window.localStorage.setItem('viora_language',savedLanguage);
  dom.window.eval(script);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return dom;
}
test('Chinese is default across landing and workspace and switching is persisted', async () => {
  const landing=page('public/index.html');
  assert.equal(landing.window.document.documentElement.lang,'zh-CN');
  assert.match(landing.window.document.querySelector('[data-i18n="nav_try"]').textContent,/进入创作室/);
  landing.window.VioraI18n.toggle();
  assert.equal(landing.window.document.documentElement.lang,'en');
  assert.match(landing.window.document.querySelector('[data-i18n="nav_try"]').textContent,/Try Viora Studio/);
  const workspace=page('public/generate.html',landing.window.localStorage.getItem('viora_language'));
  assert.equal(workspace.window.document.documentElement.lang,'en');
  assert.equal(workspace.window.document.getElementById('cloudUsername').placeholder,'Username');
  workspace.window.VioraI18n.toggle();
  assert.equal(workspace.window.document.getElementById('cloudUsername').placeholder,'用户名');
  assert.equal(workspace.window.document.getElementById('cloudSignInBtn').textContent,'登录');
  landing.window.close(); workspace.window.close();
});
test('dynamic statuses translate while user-authored prompts remain untouched', async () => {
  const dom=page('public/generate.html');
  const d=dom.window.document;
  const root=d.getElementById('generationFeedList');
  root.innerHTML='<span id="pendingStatus">Waiting in queue (#2)...</span><p data-i18n-skip id="prompt">Generate</p>';
  await tick();
  assert.equal(d.getElementById('pendingStatus').textContent,'正在排队（第 2 位）……');
  assert.equal(d.getElementById('prompt').textContent,'Generate');
  dom.window.VioraI18n.toggle();
  assert.equal(d.getElementById('pendingStatus').textContent,'Waiting in queue (#2)...');
  assert.equal(d.getElementById('prompt').textContent,'Generate');
  dom.window.close();
});
