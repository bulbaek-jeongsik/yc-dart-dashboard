'use strict';

const {inflateRawSync} = require('node:zlib');
const {createHmac,timingSafeEqual} = require('node:crypto');
const {DartError, YC} = require('./dart');
const BASE = 'https://opendart.fss.or.kr/api';
const CATEGORIES = Object.freeze({A:'정기공시',B:'주요사항',C:'발행공시',D:'지분공시',E:'기타공시',F:'외부감사',G:'펀드',H:'자산유동화',I:'거래소공시',J:'공정위공시'});
const MAX_ZIP = 22 * 1024 * 1024;
const MAX_UNCOMPRESSED = 70 * 1024 * 1024;

function validDate(s) {
  if (!/^\d{8}$/.test(s||'')) return false;
  const y=Number(s.slice(0,4)),m=Number(s.slice(4,6)),d=Number(s.slice(6,8));
  const dt=new Date(Date.UTC(y,m-1,d));
  return y>=1990&&y<=2100&&dt.getUTCFullYear()===y&&dt.getUTCMonth()+1===m&&dt.getUTCDate()===d;
}
function dateTodayKST() {return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/-/g,'');}
function validateQuery(query={}) {
  const from=query.from||'19990101',to=query.to||dateTodayKST();
  const category=query.category||'ALL';
  const page=Number(query.page||1);
  if(!validDate(from)||!validDate(to)||from>to) throw new DartError('조회 기간은 YYYYMMDD 형식의 올바른 날짜로 입력하세요.', '100');
  if(category!=='ALL'&&!Object.hasOwn(CATEGORIES,category)) throw new DartError('지원하지 않는 공시 분류입니다.', '100');
  if(!Number.isInteger(page)||page<1||page>10000) throw new DartError('페이지 번호가 올바르지 않습니다.', '100');
  return {from,to,category,page};
}
function apiUrl(route,key,params) {return `${BASE}/${route}?${new URLSearchParams({crtfc_key:key,...params})}`;}
function verifyKey(key) {if(!/^[a-zA-Z0-9]{40}$/.test(key||'')) throw new DartError('DART_API_KEY가 없거나 올바르지 않습니다. Vercel 환경변수를 확인하세요.');}
async function fetchResponse(url,fetchImpl=global.fetch,ms=20000) {
  let response;
  try {response=await fetchImpl(url,{signal:AbortSignal.timeout(ms)});} catch {throw new DartError('OpenDART 응답을 받지 못했습니다. 잠시 후 다시 시도하세요.');}
  if(!response.ok) throw new DartError(`OpenDART HTTP ${response.status} 오류입니다.`,String(response.status));
  return response;
}
function signReceipt(key,receipt) {return createHmac('sha256',key).update('YC:'+receipt).digest('hex');}
function hasValidReceiptToken(key,receipt,token) {return /^[0-9a-f]{64}$/.test(token||'') && timingSafeEqual(Buffer.from(signReceipt(key,receipt),'hex'),Buffer.from(token,'hex'));}
async function getFilings(key,query={},fetchImpl=global.fetch) {
  verifyKey(key);
  const q=validateQuery(query);
  const params={corp_code:YC.corpCode,bgn_de:q.from,end_de:q.to,last_reprt_at:'N',sort:'date',sort_mth:'desc',page_no:String(q.page),page_count:'100'};
  if(q.category!=='ALL') params.pblntf_ty=q.category;
  const response=await fetchResponse(apiUrl('list.json',key,params),fetchImpl);
  let payload;
  try {payload=await response.json();} catch {throw new DartError('공시목록 응답을 읽지 못했습니다.');}
  if(payload.status==='013') return {company:YC,asOf:new Date().toISOString(),query:q,total:0,totalPages:0,filings:[]};
  if(payload.status!=='000'||!Array.isArray(payload.list)) throw new DartError(`공시 목록 조회 실패: ${payload.message||'응답 오류'} (${payload.status||'?'})`,payload.status);
  return {company:YC,asOf:new Date().toISOString(),query:q,total:Number(payload.total_count)||0,totalPages:Number(payload.total_page)||0,filings:payload.list.map(f=>({rcept_no:f.rcept_no,token:signReceipt(key,f.rcept_no),rcept_dt:f.rcept_dt,report_nm:f.report_nm,corp_name:f.corp_name,flr_nm:f.flr_nm,corp_cls:f.corp_cls,rm:f.rm||'',type:categorize(f.report_nm),viewer:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${f.rcept_no}`}))};
}
function categorize(name='') {
  const n=String(name);
  if(/분기보고서|반기보고서|사업보고서/.test(n)) return '정기공시';
  if(/대량보유|임원.*주요주주.*소유|지분/.test(n)) return '지분공시';
  if(/단일판매|공급계약|신규시설투자|타법인주식|주요사항/.test(n)) return '수주·투자';
  if(/감사보고서|감사인/.test(n)) return '감사';
  if(/기업설명회|IR/.test(n)) return 'IR';
  return '기타';
}
function validateReceipt(receipt) {if(!/^\d{14}$/.test(receipt||'')) throw new DartError('14자리 공시 접수번호가 필요합니다.','100');return receipt;}
function safeZipEntries(zip){
  if(zip.length<22) throw new DartError('원문 ZIP 데이터가 올바르지 않습니다.');
  // ZIP end-of-central-directory, search backward to account for comments.
  let end=-1;
  for(let i=zip.length-22;i>=Math.max(0,zip.length-65557);i--){if(zip.readUInt32LE(i)===0x06054b50){end=i;break;}}
  if(end<0) throw new DartError('원문 ZIP의 목록을 찾을 수 없습니다.');
  const count=zip.readUInt16LE(end+10),dirSize=zip.readUInt32LE(end+12),offset=zip.readUInt32LE(end+16);
  if(count>250||offset+dirSize>zip.length) throw new DartError('ZIP 내부 데이터가 너무 크거나 손상되었습니다.');
  let cursor=offset,total=0;
  const entries=[];
  for(let i=0;i<count;i++){
    if(cursor+46>zip.length||zip.readUInt32LE(cursor)!==0x02014b50) throw new DartError('ZIP 파일 목록에 오류가 있습니다.');
    const flags=zip.readUInt16LE(cursor+8),method=zip.readUInt16LE(cursor+10),compressed=zip.readUInt32LE(cursor+20),uncompressed=zip.readUInt32LE(cursor+24);
    const n=zip.readUInt16LE(cursor+28),e=zip.readUInt16LE(cursor+30),c=zip.readUInt16LE(cursor+32),local=zip.readUInt32LE(cursor+42);
    const name=zip.subarray(cursor+46,cursor+46+n).toString('utf8');
    cursor+=46+n+e+c;
    if(!/\.(xml|htm|html|txt)$/i.test(name) || name.includes('..') || name.startsWith('/') || name.includes('\\')) continue;
    total+=uncompressed;
    if(total>MAX_UNCOMPRESSED||uncompressed>MAX_UNCOMPRESSED) throw new DartError('원문 크기가 미리보기 안전 한도를 초과했습니다. DART 원문 뷰어에서 확인하세요.');
    entries.push({name,method,flags,compressed,uncompressed,local});
  }
  return entries;
}
function unpackEntry(zip,entry) {
  if(entry.flags&1) throw new DartError('암호화된 ZIP은 미리보기를 지원하지 않습니다.');
  if(![0,8].includes(entry.method)) throw new DartError('지원하지 않는 ZIP 압축 방식입니다.');
  const p=entry.local;
  if(p+30>zip.length||zip.readUInt32LE(p)!==0x04034b50) throw new DartError('ZIP 파일 위치가 유효하지 않습니다.');
  const begin=p+30+zip.readUInt16LE(p+26)+zip.readUInt16LE(p+28);
  if(begin+entry.compressed>zip.length) throw new DartError('ZIP 내부 파일이 손상되었습니다.');
  const data=zip.subarray(begin,begin+entry.compressed);
  const output=entry.method===8?inflateRawSync(data,{maxOutputLength:MAX_UNCOMPRESSED}):data;
  if(output.length!==entry.uncompressed) throw new DartError('ZIP 원문 크기 검증에 실패했습니다.');
  return output;
}
function decodeDocument(buf) {
  const header=buf.subarray(0,500).toString('latin1');
  const encoding=header.match(/encoding\s*=\s*["']([^"']+)["']/i)?.[1]||'';
  const codec=/euc-?kr|ks_c_5601|cp949/i.test(encoding)?'euc-kr':'utf-8';
  try {return new TextDecoder(codec).decode(buf);} catch {return buf.toString('utf8');}
}
function decodeEntities(t){return t.replace(/&#(x[0-9a-f]+|\d+);?/gi,(_,n)=>{const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/&(?:nbsp|amp|lt|gt|quot|apos|middot|hellip);/gi,x=>({'&nbsp;':' ','&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&middot;':'·','&hellip;':'…'}[x.toLowerCase()]||x));}
function readableDocument(markup){
  return decodeEntities(markup.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,' ').replace(/<!--([\s\S]*?)-->/g,'').replace(/<\s*br\s*\/?\s*>/gi,'\n').replace(/<\/\s*(?:p|title|subtitle|caption|tr|table|div|h[1-6]|section|article|li)\s*>/gi,'\n').replace(/<\/\s*(?:td|th)\s*>/gi,'\t').replace(/<[^>]*>/g,' ')).replace(/\r\n?/g,'\n').replace(/[ \t]{2,}/g,' ').replace(/\n[ \t]+/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{4,}/g,'\n\n\n').trim();
}
async function getOriginalZip(key,receipt,fetchImpl=global.fetch){
  verifyKey(key);validateReceipt(receipt);
  const response=await fetchResponse(apiUrl('document.xml',key,{rcept_no:receipt}),fetchImpl,30000);
  const headerSize=Number(response.headers?.get?.('content-length')||0);
  if(headerSize>MAX_ZIP) throw new DartError('원문 ZIP이 다운로드 한도를 초과합니다. DART 원문 뷰어를 이용하세요.');
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length>MAX_ZIP) throw new DartError('원문 ZIP이 서버 처리 한도를 초과합니다. DART 원문 뷰어를 이용하세요.');
  if(bytes.length<4||bytes.subarray(0,2).toString()!=='PK'){
    const xml=bytes.toString('utf8');
    const status=xml.match(/<status>([^<]+)<\/status>/i)?.[1]||'?';
    const msg=xml.match(/<message>([^<]+)<\/message>/i)?.[1]||'원문을 제공하지 않는 공시입니다.';
    throw new DartError(`DART 원문: ${msg} (${status})`,status);
  }
  return bytes;
}
function parseDocument(zip,receipt,part=0,chunk=1){
  const entries=safeZipEntries(zip);
  if(!entries.length) throw new DartError('미리보기 가능한 XML·HTML·TXT 파일이 없습니다. DART 원문 뷰어에서 확인하세요.');
  if(!Number.isInteger(part)||part<0||part>=entries.length) throw new DartError('원문 파일 번호가 올바르지 않습니다.','100');
  const chosen=entries[part],txt=readableDocument(decodeDocument(unpackEntry(zip,chosen)));
  const chunkSize=40000,totalChunks=Math.max(1,Math.ceil(txt.length/chunkSize));
  if(!Number.isInteger(chunk)||chunk<1||chunk>totalChunks) throw new DartError('원문 페이지 번호가 올바르지 않습니다.','100');
  return {receipt,parts:entries.map((e,i)=>({index:i,name:e.name,bytes:e.uncompressed})),selectedPart:part,chunk,totalChunks,totalCharacters:txt.length,text:txt.slice((chunk-1)*chunkSize,chunk*chunkSize),viewer:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${receipt}`,notice:'XML/HTML의 텍스트를 추출한 미리보기입니다. 표 구조, 이미지, 별도 첨부파일은 DART 공식 뷰어를 우선 확인하세요.'};
}
module.exports={CATEGORIES,validDate,validateQuery,signReceipt,hasValidReceiptToken,getFilings,categorize,validateReceipt,safeZipEntries,unpackEntry,readableDocument,getOriginalZip,parseDocument};
