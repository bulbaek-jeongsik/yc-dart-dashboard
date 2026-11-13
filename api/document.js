'use strict';
const {getOriginalZip,parseDocument,validateReceipt,hasValidReceiptToken} = require('../lib/archive');
const {DartError} = require('../lib/dart');
const cache=new Map();
module.exports=async function(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'GET만 지원합니다.'});
  if(!process.env.DART_API_KEY) return res.status(503).json({error:'DART_API_KEY 환경변수가 등록되지 않았습니다.',setupRequired:true});
  try {
    const receipt=validateReceipt(req.query.receipt);
    if(!hasValidReceiptToken(process.env.DART_API_KEY,receipt,req.query.token)) return res.status(403).json({error:'와이씨 공시목록에서 선택한 접수번호만 조회할 수 있습니다. 목록을 다시 조회하세요.'});
    const format=req.query.format||'text';
    if(!['text','zip'].includes(format)) throw new DartError('지원하지 않는 파일 형식입니다.','100');
    const now=Date.now();let old=cache.get(receipt),zip=old&&old.expiry>now?old.value:null;
    if(!zip){zip=await getOriginalZip(process.env.DART_API_KEY,receipt);if(cache.size>2)cache.clear();cache.set(receipt,{value:zip,expiry:now+5*60*1000});}
    if(format==='zip'){
      // Vercel Functions impose an approximately 4.5 MB response-body limit.
      if(zip.length>4*1024*1024) return res.status(413).json({error:'원본 ZIP이 Vercel 다운로드 제한(4MB)을 넘습니다. DART 공식 원문 뷰어를 이용하세요.',viewer:`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${receipt}`});
      res.setHeader('Content-Type','application/zip');
      res.setHeader('Content-Disposition',`attachment; filename="DART_${receipt}.zip"`);
      return res.status(200).send(zip);
    }
    const part=Number(req.query.part??0),chunk=Number(req.query.chunk??1);
    const result=parseDocument(zip,receipt,part,chunk);
    res.setHeader('Cache-Control','private, max-age=0, s-maxage=300');return res.status(200).json(result);
  } catch(e){return res.status(e.status==='100'?400:502).json({error:e.message});}
};
