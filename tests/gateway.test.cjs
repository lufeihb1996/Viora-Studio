const test = require('node:test');
const assert = require('node:assert/strict');
const PRIVATE = 'https://private-gateway.invalid';
process.env.MOSS_GATEWAY_URL = PRIVATE;
const handler = require('../api/moss.js');

function res() {
  return { headers:{}, statusCode:200, setHeader(k,v){this.headers[k]=v;}, status(n){this.statusCode=n;return this;}, json(data){this.body=data;return this;}, send(data){this.body=data;return this;}, end(){return this;} };
}
async function invoke(url, method='GET', body={}) {const out=res();await handler({url,method,body,headers:{authorization:'Bearer test-token'}},out);return out;}
function setupGateway() {
  const requests=[];
  global.fetch=async (url,options={})=>{
    requests.push(String(url));
    const p=new URL(url);
    if (p.pathname.endsWith('/rpc/viora_claim_generation')) return new Response(JSON.stringify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
    if (p.pathname.endsWith('/rpc/viora_release_generation')) return new Response(JSON.stringify(null));
    if (p.pathname==='/system_stats') return new Response(JSON.stringify({devices:[{name:'private GPU'}]}));
    if (p.pathname==='/queue') return new Response(JSON.stringify({queue_running:[],queue_pending:[]}));
    if (p.pathname==='/prompt') return new Response(JSON.stringify({prompt_id:'job-123'}));
    if (p.pathname==='/history/job-123') return new Response(JSON.stringify({'job-123':{outputs:{'10':{images:[{filename:'model_secret.png',subfolder:'private_model',type:'output'}]}}}}));
    if (p.pathname==='/view') return new Response(new Uint8Array([1,2,3]));
    throw new Error('Private address ' + PRIVATE);
  };
  return requests;
}
test('blocks configuration access and gateway overrides',async()=>{
  const requests=setupGateway();
  assert.equal((await invoke('/api/moss?action=settings')).statusCode,404);
  assert.equal((await invoke('/api/moss?action=ping&gateway_url=https://evil.invalid')).statusCode,400);
  assert.equal((await invoke('/api/moss?action=prompt','POST',{prompt:'x',comfy_url:'https://evil.invalid'})).statusCode,400);
  assert.equal(requests.length,0);
});
test('status and image responses do not contain upstream URL or filename',async()=>{
  setupGateway();
  const ping=await invoke('/api/moss?action=ping');
  assert.equal(ping.body.online,true);
  assert.doesNotMatch(JSON.stringify(ping.body),/private-gateway|private GPU/);
  const submit=await invoke('/api/moss?action=prompt','POST',{prompt:'x'});
  assert.equal(submit.body.prompt_id,'job-123');
  const status=await invoke('/api/moss?action=status&prompt_id=job-123');
  assert.equal(status.body.status,'DONE');
  assert.doesNotMatch(JSON.stringify(status.body),/private-gateway|model_secret|private_model/);
  const view=await invoke(status.body.item.media_url);
  assert.deepEqual([...view.body],[1,2,3]);
});
test('does not send upstream errors to clients',async()=>{
  global.fetch=async(url)=>{ if (String(url).includes('/rpc/viora_claim_generation')) return new Response(JSON.stringify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')); if (String(url).includes('/rpc/viora_release_generation')) return new Response(JSON.stringify(null)); throw new Error(PRIVATE); };
  const out=await invoke('/api/moss?action=prompt','POST',{prompt:'x'});
  assert.equal(out.statusCode,502);
  assert.doesNotMatch(JSON.stringify(out.body),/private-gateway/);
});

test('busy global queue rejects submission before forwarding prompt',async()=>{
  const requests=setupGateway(); const original=global.fetch;
  global.fetch=async(url,opts)=>String(url).endsWith('/queue')
    ? new Response(JSON.stringify({queue_running:[[1,'other']],queue_pending:[]}))
    : original(url,opts);
  const result=await invoke('/api/moss?action=prompt','POST',{prompt:'x'});
  assert.equal(result.statusCode,409);
  assert.equal(requests.some(x=>x.endsWith('/prompt')),false);
});
test('simultaneous submissions allow only the lease holder through',async()=>{
  let held=false, submits=0;let unblock;
  const gate=new Promise(resolve=>{unblock=resolve;});
  global.fetch=async(url)=>{
    const p=new URL(url);
    if(p.pathname.endsWith('/rpc/viora_claim_generation')) {if(held)return new Response('null');held=true;return new Response(JSON.stringify('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));}
    if(p.pathname.endsWith('/rpc/viora_release_generation')) {held=false;return new Response('null');}
    if(p.pathname==='/queue') return new Response(JSON.stringify({queue_running:[],queue_pending:[]}));
    if(p.pathname==='/prompt') {submits++;await gate;return new Response(JSON.stringify({prompt_id:'job-123'}));}
    throw new Error('unexpected');
  };
  const a=invoke('/api/moss?action=prompt','POST',{prompt:'a'});
  await new Promise(resolve=>setTimeout(resolve,0));
  const b=await invoke('/api/moss?action=prompt','POST',{prompt:'b'});
  assert.equal(b.statusCode,409);unblock();const first=await a;
  assert.equal(first.statusCode,200);assert.equal(submits,1);
});


test('old queued jobs report global work ahead in priority order',async()=>{
  setupGateway();const prior=global.fetch;
  global.fetch=async(url,opts)=>{
    const p=new URL(url);
    if(p.pathname==='/history/job-123') return new Response(JSON.stringify({}));
    if(p.pathname==='/queue') return new Response(JSON.stringify({queue_running:[[0,'running']],queue_pending:[[4,'later'],[2,'before'],[3,'job-123']]}));
    return prior(url,opts);
  };
  const status=await invoke('/api/moss?action=status&prompt_id=job-123');
  assert.equal(status.body.status,'QUEUED');assert.equal(status.body.queue_ahead,2);
});
test('submission requires authenticated user token',async()=>{
  setupGateway();const output=res();
  await handler({url:'/api/moss?action=prompt',method:'POST',body:{prompt:'x'},headers:{}},output);
  assert.equal(output.statusCode,401);
});
