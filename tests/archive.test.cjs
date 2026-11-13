'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {deflateRawSync}=require('node:zlib');
const {validateQuery,readableDocument,getFilings,getOriginalZip,parseDocument,validateReceipt}=require('../lib/archive');
const KEY='a'.repeat(40);
function zipOne(name,content){
 const source=Buffer.from(content,'utf8'),data=deflateRawSync(source),n=Buffer.from(name);
 const a=Buffer.alloc(30);a.writeUInt32LE(0x04034b50,0);a.writeUInt16LE(20,4);a.writeUInt16LE(8,8);a.writeUInt32LE(data.length,18);a.writeUInt32LE(source.length,22);a.writeUInt16LE(n.length,26);
 const b=Buffer.alloc(46);b.writeUInt32LE(0x02014b50,0);b.writeUInt16LE(20,4);b.writeUInt16LE(20,6);b.writeUInt16LE(8,10);b.writeUInt32LE(data.length,20);b.writeUInt32LE(source.length,24);b.writeUInt16LE(n.length,28);
 const e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(1,8);e.writeUInt16LE(1,10);e.writeUInt32LE(b.length+n.length,12);e.writeUInt32LE(a.length+n.length+data.length,16);
 return Buffer.concat([a,n,data,b,n,e]);
}
test('query validates archive dates, page, and category',()=>{
 assert.deepEqual(validateQuery({from:'20200101',to:'20261231',page:'2',category:'I'}),{from:'20200101',to:'20261231',page:2,category:'I'});
 assert.throws(()=>validateQuery({from:'20260230',to:'20261231'}));
 assert.throws(()=>validateQuery({category:'A001'}));
 assert.throws(()=>validateQuery({page:'-1'}));
});
test('list API requests all reports including corrections, normalizes output, and does not expose key',async()=>{
 let requested;
 const mock=async url=>{requested=new URL(url);return {ok:true,json:async()=>({status:'000',total_count:201,total_page:3,list:[{rcept_no:'20260929900999',report_nm:'[기재정정]단일판매ㆍ공급계약체결',rcept_dt:'20260929',flr_nm:'와이씨'}]})};};
 const result=await getFilings(KEY,{from:'20200101',to:'20261113',category:'ALL',page:2},mock);
 assert.equal(result.total,201);assert.equal(result.totalPages,3);assert.match(result.filings[0].token,/^[0-9a-f]{64}$/);assert.equal(result.filings[0].type,'수주·투자');
 assert.equal(requested.searchParams.get('last_reprt_at'),'N');assert.equal(requested.searchParams.get('corp_code'),'01109539');assert.equal(requested.searchParams.get('page_count'),'100');
 assert.equal(JSON.stringify(result).includes(KEY),false);
});
test('no filings is not an error',async()=>{const r=await getFilings(KEY,{from:'20200101',to:'20200131'},async()=>({ok:true,json:async()=>({status:'013'})}));assert.equal(r.total,0);assert.deepEqual(r.filings,[]);});
test('server-side document loads ZIP, preserves Korean content, paginates',async()=>{
 const receipt='20260318001234',bytes=zipOne(receipt+'.xml','<?xml version="1.0" encoding="UTF-8"?><DOCUMENT><TITLE>사업의 내용</TITLE><P>테스터 제품 매출 &amp; 수주잔고</P></DOCUMENT>');
 const result=await getOriginalZip(KEY,receipt,async u=>({ok:true,headers:{get:()=>String(bytes.length)},arrayBuffer:async()=>bytes}));
 assert.deepEqual(result,bytes);
 const doc=parseDocument(result,receipt,0,1);assert.equal(doc.totalChunks,1);assert.match(doc.text,/테스터 제품 매출 & 수주잔고/);assert.equal(doc.parts.length,1);
});
test('rejects invalid receipt and DART error XML',async()=>{
 assert.throws(()=>validateReceipt('../file'));
 await assert.rejects(()=>getOriginalZip(KEY,'20260318001234',async()=>({ok:true,headers:{get:()=>null},arrayBuffer:async()=>Buffer.from('<result><status>014</status><message>파일 없음</message></result>')})),/파일 없음/);
});
test('html strip preserves readable lines without scripts',()=>{const t=readableDocument('<TITLE>주석</TITLE><script>alert(1)</script><P>매출액&#32;100</P>');assert.match(t,/주석/);assert.match(t,/매출액 100/);assert.doesNotMatch(t,/alert/);});


test('document proxy denies unsigned receipt requests before DART fetch',async()=>{
 const handler=require('../api/document.js');
 const prev=process.env.DART_API_KEY;process.env.DART_API_KEY=KEY;
 try {const res={code:200,status(v){this.code=v;return this;},json(x){this.payload=x;return this;}};await handler({method:'GET',query:{receipt:'20260318001234'}},res);assert.equal(res.code,403);assert.match(res.payload.error,/목록/);}finally{if(prev===undefined)delete process.env.DART_API_KEY;else process.env.DART_API_KEY=prev;}
});
