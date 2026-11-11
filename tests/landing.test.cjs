const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

test('landing page renders its sections and hides model branding', () => {
  const dom = new JSDOM(fs.readFileSync('public/index.html', 'utf8'), { url: 'http://127.0.0.1:3091/', runScripts: 'outside-only' });
  const { window } = dom;
  window.tailwind = { config: {} };
  window.setInterval = () => 1;
  for (const script of window.document.querySelectorAll('script:not([src])')) window.eval(script.textContent);
  window.initPage();
  assert.match(window.document.querySelector('h1').textContent, /Viora Studio/);
  assert.ok(window.document.getElementById('styleTabsContainer').children.length);
  assert.ok(window.document.getElementById('faqContainer').children.length);
  assert.doesNotMatch(window.document.body.textContent.replace(/\s+/g, ' ').split('const HERO_ITEMS')[0], /MOSS|Qwen3|FLUX\.2|SLG/i);
  dom.window.close();
});
test('workspace has no endpoint settings or client-controlled gateway URL', () => {
  const dom = new JSDOM(fs.readFileSync('public/generate.html', 'utf8'));
  const document = dom.window.document;
  assert.equal(document.getElementById('comfyUrlInput'), null);
  assert.equal(document.getElementById('comfyModal'), null);
  assert.equal(document.querySelector('[onclick="openComfyModal()"]'), null);
  assert.doesNotMatch(document.documentElement.outerHTML, /gateway_url|comfy_url|Server connection/);
  dom.window.close();
});
