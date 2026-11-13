'use strict';
const {loadData, DartError} = require('../lib/dart');
const cache = new Map();
module.exports = async function handler(req,res) {
  if (req.method !== 'GET') {res.setHeader('Allow','GET');return res.status(405).json({error:'GET 요청만 지원합니다.'});}
  const fs = req.query.fs || 'CFS';
  if(!['CFS','OFS'].includes(fs)) return res.status(400).json({error:'재무제표 구분은 CFS 또는 OFS만 허용됩니다.'});
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) return res.status(503).json({error:'DART_API_KEY 환경변수가 등록되지 않았습니다.',setupRequired:true});
  const key = fs;
  const existing=cache.get(key);
  if(existing && existing.expiry>Date.now()) return res.status(200).json(existing.value);
  try {
    const value = await loadData(apiKey,fs);
    if(!value.annual.length && !value.quarterlyCumulative.length) return res.status(502).json({error:'DART에서 선택한 기준의 재무제표를 조회하지 못했습니다.',issues:value.issues});
    cache.set(key,{expiry:Date.now()+15*60*1000,value});
    res.setHeader('Cache-Control','private, max-age=0, s-maxage=900');
    return res.status(200).json(value);
  } catch(e) {
    const status=(e instanceof DartError && e.status && e.status !== '013') ? 502 : 500;
    return res.status(status).json({error:e.message||'알 수 없는 오류입니다.'});
  }
};
