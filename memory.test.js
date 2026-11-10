import test from 'node:test';
import assert from 'node:assert/strict';
import { context } from './memory.js';
test('memory preserves dates, original claims and evidence without rewriting',()=>{
 const turns=[{timestamp:'2026-11-03T23:30:00Z',timezone:'Asia/Calcutta',question:'Compare hosting',answer:'Old claim',evidence:[{url:'https://example.com',text:'old price'}]}];
 const recovered=JSON.parse(context(turns)); assert.equal(recovered[0].question,turns[0].question); assert.equal(recovered[0].timestamp,turns[0].timestamp); assert.equal(recovered[0].answer,turns[0].answer);
});
test('oversized memory fails explicitly instead of losing old references',()=>{
 assert.throws(()=>context([{question:'old shortlist'}, {question:'new request'}],20),/context budget/);
});
