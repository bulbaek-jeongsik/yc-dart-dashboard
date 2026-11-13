const test=require('node:test');
const assert=require('node:assert/strict');
const {amount,selectMetric,capexAmount,summarize,buildQuarters,loadData}=require('../lib/dart');
test('금액 변환과 결측치',()=>{
 assert.equal(amount('1,200,000'),1200000);assert.equal(amount('(1,200)'),-1200);assert.equal(amount('-'),null);
});
test('재무항목은 계정 ID 우선 & 손익계산서 내 선택',()=>{
 const rows=[
  {sj_div:'IS',account_id:'ifrs-full_Revenue',account_nm:'매출액',thstrm_amount:'1,000'},
  {sj_div:'CIS',account_id:'ifrs-full_ProfitLoss',account_nm:'당기순이익(손실)',thstrm_amount:'100'},
  {sj_div:'IS',account_id:'dart_OperatingIncomeLoss',account_nm:'영업이익(손실)',thstrm_amount:'300'},
  {sj_div:'BS',account_id:'ifrs-full_Assets',account_nm:'자산총계',thstrm_amount:'2,000'}
 ];
 assert.equal(selectMetric(rows,'revenue'),1000);assert.equal(selectMetric(rows,'operatingProfit'),300);
 assert.equal(selectMetric(rows,'netIncome'),100);assert.equal(selectMetric(rows,'assets'),2000);
});
test('CAPEX 합계 (표준계정)',()=>{
 const rows=[
  {sj_div:'CF',account_id:'ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities',account_nm:'유형자산의 취득',thstrm_amount:'-300'},
  {sj_div:'CF',account_id:'ifrs-full_PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities',account_nm:'무형자산의 취득',thstrm_amount:'20'}
 ];
 assert.equal(capexAmount(rows),320);
});
test('누적 분기 수치를 당분기로 환산하고 잔액 계정은 당기말 유지',()=>{
 const mk=(period, revenue, op, assets)=>({year:2026,period,metrics:{revenue,operatingProfit:op,netIncome:op,cfo:op,capex:20,fcf:op-20,assets}});
 const q=buildQuarters([mk('Q1',100,10,1000),mk('H1',280,35,1100),mk('Q3',450,50,1200)]);
 assert.deepEqual(q.map(x=>x.metrics.revenue),[100,180,170]);assert.deepEqual(q.map(x=>x.metrics.assets),[1000,1100,1200]);
});
test('DART 응답 013은 미공시 처리',async()=>{
 const fetcher=async()=>({ok:true,json:async()=>({status:'013',message:'조회된 데이터가 없습니다.'})});
 const data=await loadData('a'.repeat(40),'CFS',fetcher);
 assert.equal(data.annual.length,0);assert.equal(data.quarters.length,0);assert.equal(data.issues.length,0);
});
