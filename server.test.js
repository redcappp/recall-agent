import test from 'node:test';
import assert from 'node:assert/strict';
import { rm, readFile } from 'node:fs/promises';
process.env.NODE_ENV='test';
const { app }=await import('./server.js');
const nativeFetch=globalThis.fetch;
const server=app.listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
let cookie, id;
async function request(path,body,headers={}){return nativeFetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});}
test('HTTP workflow: isolation, keys, tool loop, persistence and failures',async()=>{
 try{
  let r=await request('/api/history');cookie=r.headers.get('set-cookie').split(';')[0];id=cookie.split('=')[1];assert.deepEqual(await r.json(),[]);
  assert.equal((await request('/api/chat',{message:'hi',keys:{anthropic:42}})).status,400);
  assert.equal((await request('/api/chat',{message:'hi'},{origin:'https://attacker.example'})).status,403);
  let modelCalls=0;const payloads=[];
  globalThis.fetch=async(url,options)=>{
   const body=JSON.parse(options.body);payloads.push(body);
   if(url.includes('anthropic')){
    assert.equal(options.headers['x-api-key'],'test-anthropic');
    assert.equal(body.tools.length,1);assert.equal(body.tools[0].name,'web_search');
    modelCalls++;
    if(modelCalls===1)return Response.json({content:[{type:'tool_use',id:'search1',name:'web_search',input:{query:'official CRM pricing'}}],stop_reason:'tool_use'});
    assert.match(JSON.stringify(body.messages),/retrievedAt/);
    return Response.json({content:[{type:'text',text:'Current price: [source](https://example.com/pricing).'}],stop_reason:'end_turn'});
   }
   assert.equal(body.api_key,'test-tavily');
   return Response.json({results:[{title:'Official pricing',url:'https://example.com/pricing',content:'Price: $20'}]});
  };
  r=await request('/api/chat',{message:'Compare CRM pricing',timezone:'Asia/Calcutta',keys:{anthropic:'test-anthropic',tavily:'test-tavily'}});
  const events=(await r.text()).trim().split('\n').map(JSON.parse);assert.ok(events.at(-1).answer);assert.equal(events.at(-1).searches,1);
  const saved=await readFile(`data/${id}.json`,'utf8');assert.ok(!saved.includes('test-anthropic'));assert.ok(!saved.includes('test-tavily'));assert.match(saved,/Price: \$20/);
  assert.equal((await (await request('/api/history')).json()).length,1);
  assert.deepEqual(await (await nativeFetch(base+'/api/history')).json(),[]);
  globalThis.fetch=async()=>new Response('{}',{status:401});
  r=await request('/api/chat',{message:'Another question',keys:{anthropic:'bad',tavily:'bad'}});assert.match(await r.text(),/Check your API key/);
  assert.equal((await (await request('/api/history')).json()).length,1);
  assert.ok(payloads.every(p=>!JSON.stringify(p.messages || []).includes('test-anthropic')));
 }finally{globalThis.fetch=nativeFetch;await rm(`data/${id}.json`,{force:true});server.close();}
});
