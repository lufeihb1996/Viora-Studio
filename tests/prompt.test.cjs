const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('public/generate.html', 'utf8');
const cloud = fs.readFileSync('public/assets/cloud.js', 'utf8');
async function setup(fetchImpl) {
  const dom = new JSDOM(html,{url:'http://127.0.0.1:3091/generate.html',runScripts:'outside-only'});
  const w=dom.window;
  w.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})}})}; w.MOSS_SUPABASE={url:'https://example.test',key:'test'};
  w.VioraI18n={text:x=>x}; w.fetch=fetchImpl; w.alert=()=>{}; w.console.error=()=>{};
  w.setInterval=()=>0; w.requestAnimationFrame=()=>0;
  w.HTMLElement.prototype.scrollTo=function(){};
  const scripts=[...w.document.querySelectorAll('script:not([src])')];
  w.eval(cloud+'\n'+scripts.at(-1).textContent+`\ncloudUser={id:'user'}; queueState={online:true,available:true,running:0,pending:0}; cloudInit=async()=>true; loadComfySettings=async()=>{}; refreshWorkspaceImages=async()=>{}; pollActiveJobs=async()=>{}; window.testSubmit=submitRealMossGeneration; window.testJobs=()=>inFlightJobs; window.setQueue=(state)=>{queueState=state; updateQueueView();}; window.testQueueView=updateQueueView;`);
  await new Promise(r=>setTimeout(r,0));
  return dom;
}
test('successful submission clears input and displays the submitted prompt',async()=>{
  const dom=await setup(async()=>({ok:true,json:async()=>({prompt_id:'job-1'})}));
  const d=dom.window.document; d.getElementById('workspacePromptInput').value='  A quiet lake  ';
  await dom.window.testSubmit();
  assert.equal(d.getElementById('workspacePromptInput').value,'');
  assert.equal(dom.window.testJobs()[0].prompt,'A quiet lake');
  assert.equal(d.querySelector('#pending-job-1 [data-i18n-skip]').textContent,'A quiet lake');
  dom.window.close();
});
test('failed submission preserves prompt for retry',async()=>{
  const dom=await setup(async()=>({ok:false,json:async()=>({error:'offline'})}));
  const input=dom.window.document.getElementById('workspacePromptInput');input.value='A quiet lake';
  await dom.window.testSubmit(); assert.equal(input.value,'A quiet lake');
  assert.equal(dom.window.testJobs().length,0);dom.window.close();
});
test('does not erase a new prompt typed while submission is pending',async()=>{
  let complete;const pending=new Promise(resolve=>{complete=resolve;});
  const dom=await setup(()=>pending);const input=dom.window.document.getElementById('workspacePromptInput');
  input.value='First image';const submit=dom.window.testSubmit();input.value='Next image';
  complete({ok:true,json:async()=>({prompt_id:'job-2'})});await submit;
  assert.equal(input.value,'Next image');assert.equal(dom.window.testJobs()[0].prompt,'First image');dom.window.close();
});

test('other users running or waiting blocks submission and shows global task counts',async()=>{
  let calls=0;const dom=await setup(async()=>{calls++;return {ok:true,json:async()=>({prompt_id:'job'})};});
  const d=dom.window.document;d.getElementById('workspacePromptInput').value='Waiting prompt';
  dom.window.setQueue({online:true,available:true,running:1,pending:2});
  assert.equal(d.getElementById('workspaceGenBtn').disabled,true);
  assert.match(d.getElementById('queueNotice').textContent,/生成 1 个，等待 2 个任务/);
  await dom.window.testSubmit();assert.equal(calls,0);
  assert.equal(d.getElementById('workspacePromptInput').value,'Waiting prompt');
  dom.window.setQueue({online:true,available:true,running:0,pending:0});
  assert.equal(d.getElementById('workspaceGenBtn').disabled,false);dom.window.close();
});
test('unavailable queue fails closed and leaves prompt untouched',async()=>{
  let calls=0;const dom=await setup(async()=>{calls++;return {ok:true,json:async()=>({})};});
  const d=dom.window.document;d.getElementById('workspacePromptInput').value='Keep this';
  dom.window.setQueue({online:true,available:false,running:0,pending:0});
  assert.equal(d.getElementById('workspaceGenBtn').disabled,true);await dom.window.testSubmit();assert.equal(calls,0);
  assert.equal(d.getElementById('workspacePromptInput').value,'Keep this');dom.window.close();
});


test('a race rejected by the server retains the prompt and creates no job',async()=>{
  const dom=await setup(async()=>({ok:false,status:409,json:async()=>({error:'busy'})}));
  const input=dom.window.document.getElementById('workspacePromptInput');input.value='Keep prompt';
  await dom.window.testSubmit();assert.equal(input.value,'Keep prompt');assert.equal(dom.window.testJobs().length,0);dom.window.close();
});
