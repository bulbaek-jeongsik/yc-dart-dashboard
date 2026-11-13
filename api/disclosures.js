'use strict';
const {getFilings} = require('../lib/archive');
const cache=new Map();
module.exports=async function(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'GET만 지원합니다.'});
  if(!process.env.DART_API_KEY) return res.status(503).json({error:'DART_API_KEY 환경변수가 등록되지 않았습니다.',setupRequired:true});
  const q={from:req.query.from,to:req.query.to,category:req.query.category,page:req.query.page};
  const key=JSON.stringify(q),old=cache.get(key);
  if(old&&old.expiry>Date.now())return res.status(200).json(old.value);
  try {const value=await getFilings(process.env.DART_API_KEY,q);if(cache.size>120)cache.clear();cache.set(key,{value,expiry:Date.now()+5*60*1000});res.setHeader('Cache-Control','private, max-age=0, s-maxage=300');return res.status(200).json(value);}
  catch(e){return res.status(e.status==='100'?400:502).json({error:e.message});}
};
