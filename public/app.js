import { marked } from '/vendor/marked.js';
import DOMPurify from '/vendor/purify.js';
const $ = selector => document.querySelector(selector);
const form = $('#composer'), input = $('#message'), send = $('#send'), status = $('#status');
let config = {}, ready = false;
function keyValues() { return {anthropic:$('#anthropic').value.trim(), tavily:$('#tavily').value.trim()}; }
function connected() { const keys = keyValues(); return (keys.anthropic || config.anthropic) && (keys.tavily || config.tavily); }
function updateConnection() { $('#connection').textContent = connected() ? '● Keys configured' : '● Set up your keys'; }
for(const id of ['#settings-button','#connection']) $(id).onclick=()=>$('#settings').showModal();
$('#save-keys').onclick=()=>{updateConnection(); if(!connected()) {$('#key-status').textContent='Add both keys, or configure them on the server.';return;} $('#settings').close();input.focus();};
$('#clear-keys').onclick=()=>{$('#anthropic').value='';$('#tavily').value='';$('#key-status').textContent='Entered keys cleared. Any configured server keys still apply.';updateConnection();};
$('#conversation').onclick=()=>input.focus();
for(const button of document.querySelectorAll('[data-prompt]')) button.onclick=()=>{input.value=button.dataset.prompt;input.focus();};
function safeURL(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol) ? url.href : null;}catch{return null;}}
function show(text,user=false,turn){
  $('#empty').hidden=true;
  const article=document.createElement('article');article.className=user?'user':'assistant';
  const label=document.createElement('div');label.className='byline';label.textContent=user?'You':'✳ Recall';
  if(turn?.timestamp)label.textContent+=` · ${new Date(turn.timestamp).toLocaleString()}`;
  const body=document.createElement('div');body.className='body';
  if(user)body.textContent=text;else{
    body.innerHTML=DOMPurify.sanitize(marked.parse(text),{FORBID_TAGS:['img','style','input','form','button']});
    for(const a of body.querySelectorAll('a')){const url=safeURL(a.getAttribute('href'));if(!url)a.removeAttribute('href');else{a.href=url;a.target='_blank';a.rel='noopener noreferrer';}}
  }
  article.append(label,body);
  if(turn?.evidence?.length){const details=document.createElement('details'),summary=document.createElement('summary');const sources=new Map();for(const search of turn.evidence)for(const source of search.results)if(safeURL(source.url))sources.set(source.url,{...source,retrievedAt:search.retrievedAt});summary.textContent=`${sources.size} sources consulted`;details.append(summary);for(const source of sources.values()){const a=document.createElement('a');a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`${source.title || new URL(source.url).hostname} · ${new Date(source.retrievedAt).toLocaleDateString()}`;details.append(a);}article.append(details);}
  $('#chat').append(article);return article;
}
async function initialize(){send.disabled=true;try{const [c,h]=await Promise.all([fetch('/api/config'),fetch('/api/history')]);if(!c.ok||!h.ok)throw Error('Could not load your workspace. Refresh to retry.');config=await c.json();for(const turn of await h.json()){show(turn.question,true,turn);show(turn.answer,false,turn);}ready=true;updateConnection();}catch(e){status.textContent=e.message;}finally{send.disabled=!ready;}}
input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();if(!send.disabled)form.requestSubmit();}});
form.onsubmit=async e=>{
  e.preventDefault();const message=input.value.trim();if(!message||!ready||send.disabled)return;
  if(!connected()){$('#settings').showModal();$('#key-status').textContent='Add your API keys to send your first message.';return;}
  send.disabled=true;input.value='';const pending=show(message,true);status.textContent='Reading your question…';let complete=false;
  try{
    const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,keys:keyValues(),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone})});
    if(!response.ok)throw Error((await response.json()).error || 'Request failed. Please retry.');
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!line.trim())continue;const data=JSON.parse(line);if(data.status)status.textContent=data.status;if(data.error)throw Error(data.error);if(data.answer){show(data.answer,false,data.turn);complete=true;status.textContent=`Saved to memory · ${data.searches} searches · ${(data.elapsedMs/1000).toFixed(1)}s`;}}}
    if(!complete)throw Error('Connection ended before the answer arrived. Check history before retrying.');
  }catch(e){status.textContent=e.message;if(!complete){pending.remove();input.value=message;$('#empty').hidden=!!$('#chat').children.length;}}finally{send.disabled=false;input.focus();}
};
initialize();
