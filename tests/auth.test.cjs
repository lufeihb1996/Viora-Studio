const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(client) {
  const elements = Object.fromEntries(['cloudUsername','cloudPassword','cloudAuthMessage','cloudSignInBtn','cloudSignUpBtn','cloudAuth','cloudAccount'].map(id => [id, { value:'', textContent:'', disabled:false, classList:{ toggle() {} } }]));
  elements.cloudUsername.value = 'Example_User'; elements.cloudPassword.value = 'password123';
  const ctx = vm.createContext({ window:{ supabase:{ createClient:() => client }, MOSS_SUPABASE:{url:'https://example.test',key:'test'} }, document:{getElementById:id=>elements[id]}, refreshWorkspaceImages:async()=>{} });
  vm.runInContext(fs.readFileSync('public/assets/cloud.js','utf8'),ctx);
  return {ctx,elements};
}
test('registers with username then signs in without email verification', async () => {
  let request, credentials;
  const {ctx,elements}=setup({functions:{invoke:async(name,args)=>{request={name,...args.body};return {error:null};}},auth:{signInWithPassword:async value=>{credentials=value;return {data:{session:{},user:{email:value.email}},error:null};}}});
  await ctx.cloudSignIn(true);
  assert.equal(request.name,'viora-signup');
  assert.equal(request.username,'example_user');
  assert.equal(credentials.email,'example_user@viora.local.invalid');
  assert.equal(elements.cloudAccount.textContent,'example_user');
  assert.equal(elements.cloudPassword.value,'');
});
test('rejects invalid username before calling registration',async()=>{
  let calls=0; const {ctx,elements}=setup({functions:{invoke:async()=>{calls++;}},auth:{}});
  elements.cloudUsername.value='bad name'; await ctx.cloudSignIn(true);
  assert.equal(calls,0); assert.match(elements.cloudAuthMessage.textContent,/3–24/);
});
test('shows duplicate username error from server',async()=>{
  const {ctx,elements}=setup({functions:{invoke:async()=>({error:{context:{json:async()=>({error:'Username is already in use.'})}}})},auth:{}});
  await ctx.cloudSignIn(true); assert.match(elements.cloudAuthMessage.textContent,/already in use/);
});
test('keeps existing email account sign-in working',async()=>{
  let credentials;
  const {ctx,elements}=setup({functions:{},auth:{signInWithPassword:async value=>{credentials=value;return {data:{session:{},user:{email:value.email}},error:null};}}});
  elements.cloudUsername.value='older@example.com';await ctx.cloudSignIn(false);
  assert.equal(credentials.email,'older@example.com');
});
