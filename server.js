import express from 'express';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { context, policy } from './memory.js';
export const app = express();
app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(req.method !== 'GET' && req.headers.origin && req.headers.origin !== `${req.protocol}://${req.headers.host}`) return res.status(403).json({error:'Cross-origin request rejected.'});
  next();
});
app.get('/vendor/marked.js',(req,res)=>res.sendFile('node_modules/marked/lib/marked.esm.js',{root:process.cwd()}));
app.get('/vendor/purify.js',(req,res)=>res.sendFile('node_modules/dompurify/dist/purify.es.mjs',{root:process.cwd()}));
app.use(express.json({ limit: '20kb' }));
app.use(express.static('public'));
await mkdir('data', { recursive: true });
const busy = new Set();
function identity(req, res, next) {
  let id = req.headers.cookie?.match(/(?:^|; )recall=([a-f0-9-]{36})(?:;|$)/)?.[1];
  if (!id) { id = randomUUID(); res.setHeader('Set-Cookie', `recall=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000`); }
  req.userId = id; next();
}
app.use('/api', (req,res,next)=>{res.setHeader('Cache-Control','no-store');next();}, identity);
app.get('/api/config', (req,res)=>res.json({anthropic:!!process.env.ANTHROPIC_API_KEY,tavily:!!process.env.TAVILY_API_KEY,model:process.env.MODEL || 'claude-sonnet-4-6'}));
async function history(id) { try { return JSON.parse(await readFile(`data/${id}.json`, 'utf8')); } catch (e) { if(e.code === 'ENOENT') return []; throw e; } }
async function post(url, headers, body) {
  const response = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json', ...headers}, body:JSON.stringify(body), signal:AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`${url.includes('anthropic') ? 'Anthropic' : 'Tavily'} request failed (${response.status}). ${response.status === 401 || response.status === 403 ? 'Check your API key and account permissions.' : response.status === 429 ? 'Rate limit or account quota reached. Retry later.' : 'Please retry.'}`);
  return response.json();
}
app.get('/api/history', async(req,res) => res.json(await history(req.userId)));
app.post('/api/chat', async(req,res) => {
  const id = req.userId;
  if(busy.has(id)) return res.status(409).json({error:'A reply is already running.'});
  if(typeof req.body?.message !== 'string' || !req.body?.message.trim() || req.body?.message.length > 8000) return res.status(400).json({error:'Enter 1–8000 characters.'});
  const supplied = req.body.keys;
  if (supplied !== undefined && (!supplied || typeof supplied !== 'object' || Array.isArray(supplied))) return res.status(400).json({error:'Invalid API key settings.'});
  for (const value of Object.values(supplied || {})) {
    if (typeof value !== 'string' || value.length > 512 || /[\r\n]/.test(value)) return res.status(400).json({error:'Invalid API key format.'});
  }
  const anthropicKey = supplied?.anthropic?.trim() || process.env.ANTHROPIC_API_KEY;
  const tavilyKey = supplied?.tavily?.trim() || process.env.TAVILY_API_KEY;
  if(!anthropicKey || !tavilyKey) return res.status(503).json({error:'Open API key settings and enter your Anthropic and Tavily keys.'});
  busy.add(id);
  res.setHeader('Content-Type','application/x-ndjson');
  const emit = data => { if(!res.destroyed) res.write(JSON.stringify(data)+'\n'); };
  const started = Date.now();
  try {
    const turns = await history(id), timestamp = new Date().toISOString();
    const timezone = req.body.timezone || 'UTC';
    new Intl.DateTimeFormat('en',{timeZone:timezone}).format(new Date());
    const messages = [{role:'user',content:`Current time: ${timestamp}. Timezone: ${timezone}.\nConversation archive (JSON): ${context(turns)}\nCurrent request: ${req.body?.message}`}];
    const evidence = [];
    let searches = 0, answer;
    for(let step=0;step<5;step++) {
      if(res.destroyed) throw new Error('Request disconnected.');
      if(Date.now()-started > 150000) throw new Error('Research deadline reached. Please narrow your question.');
      emit({status:step ? 'Comparing evidence…' : 'Reading your question and history…'});
      const result = await post('https://api.anthropic.com/v1/messages', {'x-api-key':anthropicKey,'anthropic-version':'2023-06-01'}, {
        model:process.env.MODEL || 'claude-sonnet-4-6',max_tokens:4000,system:policy,messages,
        tools:[{name:'web_search',description:'Search the public web. Use precise queries with product names and dates; results include retrieved page text.',input_schema:{type:'object',properties:{query:{type:'string',maxLength:500}},required:['query'],additionalProperties:false}}],
        ...(step===4 ? {tool_choice:{type:'none'}} : {})
      });
      messages.push({role:'assistant',content:result.content});
      const calls = result.content.filter(b=>b.type==='tool_use');
      if(!calls.length) { if(result.stop_reason === 'max_tokens') throw new Error('Reply exceeded the output budget. Please narrow the question.'); answer=result.content.filter(b=>b.type==='text').map(b=>b.text).join('\n'); break; }
      const results = await Promise.all(calls.map(async call => {
        if(call.name !== 'web_search' || typeof call.input?.query !== 'string' || call.input?.query.length>500 || ++searches>8) return {type:'tool_result',tool_use_id:call.id,is_error:true,content:'Search budget or input limit exceeded. Explain remaining uncertainty.'};
        emit({status:`Searching: ${call.input?.query}`});
        try {
          const data = await post('https://api.tavily.com/search',{}, {api_key:tavilyKey,query:call.input?.query,search_depth:'advanced',max_results:5,include_raw_content:true});
          const record={query:call.input?.query,retrievedAt:new Date().toISOString(),results:(data.results || []).map(r=>({title:r.title,url:r.url,publishedDate:r.published_date,text:(r.raw_content || r.content || '').slice(0,7000)}))};
          evidence.push(record);
          return {type:'tool_result',tool_use_id:call.id,content:JSON.stringify(record)};
        } catch(e) { emit({status:e.message}); return {type:'tool_result',tool_use_id:call.id,is_error:true,content:'Search failed. Do not infer no change; state verification unavailable.'}; }
      }));
      messages.push({role:'user',content:results});
    }
    if(!answer) throw new Error('No complete answer returned. Please retry.');
    turns.push({id:randomUUID(),timestamp,timezone,question:req.body?.message,answer,evidence});
    await writeFile(`data/${id}.tmp`,JSON.stringify(turns));
    await rename(`data/${id}.tmp`,`data/${id}.json`);
    emit({answer,turn:turns.at(-1),elapsedMs:Date.now()-started,searches});
  } catch(e) { emit({error:e.message}); } finally {busy.delete(id);res.end();}
});
if(process.env.NODE_ENV !== 'test') app.listen(process.env.PORT || 3000,'127.0.0.1',()=>console.log('Recall: http://localhost:'+(process.env.PORT || 3000)));
app.use((err,req,res,next)=>{if(res.headersSent)return next(err);res.status(err.status || 500).json({error:err.status === 400 ? 'Invalid JSON request.' : err.status === 413 ? 'Request too large.' : 'Server error. Please retry.'});});
