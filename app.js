'use strict';
let state = { data:null, fs:'CFS', metric:'revenue', refreshKey:0 };
const KRW_100M = 1e8;
const labels={revenue:'매출액',grossProfit:'매출총이익',operatingProfit:'영업이익',netIncome:'당기순이익',cfo:'영업현금흐름',capex:'CAPEX(추정)',fcf:'잉여현금흐름',assets:'자산총계',liabilities:'부채총계',equity:'자본총계',cash:'현금및현금성자산',operatingMargin:'영업이익률',netMargin:'순이익률',debtRatio:'부채비율'};
const $=id=>document.getElementById(id);
function amt(n,digits=0){return n==null||!Number.isFinite(n)?'—':(n/KRW_100M).toLocaleString('ko-KR',{maximumFractionDigits:digits,minimumFractionDigits:digits});}
function pct(n,digits=1){return n==null||!Number.isFinite(n)?'—':`${n.toFixed(digits)}%`;}
function fmtMoney(n){return amt(n)+' 억원';}
function percentChange(curr,prev){return curr==null||prev==null||prev===0?null:(curr/Math.abs(prev)-1)*100;}
function makeCell(tag,text){const td=document.createElement(tag);td.textContent=text;return td;}
function text(id,s){$(id).textContent=s;}
function notice(heading,description,type=''){const el=$('notice');el.className=`notice ${type}`;el.hidden=false;el.innerHTML='';const bullet=document.createElement('span');bullet.className='notice-icon';bullet.textContent='●';const div=document.createElement('div');const strong=document.createElement('strong');strong.textContent=heading;const para=document.createElement('p');para.textContent=description;div.append(strong,para);el.append(bullet,div);}
async function fetchData(){
 notice('DART 데이터 조회 중',`와이씨 ${state.fs==='CFS'?'연결':'별도'} 재무제표를 요청하고 있습니다.`);
 $('refreshBtn').disabled=true;
 try {
  const response=await fetch(`/api/data?fs=${state.fs}&v=${state.refreshKey}`);
  const payload=await response.json();
  if(!response.ok) throw new Error(payload.error+(payload.issues?.length?` / ${payload.issues.slice(0,2).join(' · ')}`:''));
  state.data=payload;$('dashboard').hidden=false;render();
  if(payload.issues.length) notice('일부 공시 조회에 실패했습니다',payload.issues.join(' / '),'warn');
  else $('notice').hidden=true;
 } catch(e) {state.data=null;$('dashboard').hidden=true;notice('데이터를 표시할 수 없습니다',`${e.message}  ·  설정 방법은 README.md를 참고하세요.`,'warn');}
 finally{$('refreshBtn').disabled=false;}
}
function render(){
 const d=state.data;const a=d.annual, last=a.at(-1), prev=a.at(-2), fsName=state.fs==='CFS'?'연결':'별도';
 text('updateTime',`조회 ${new Date(d.asOf).toLocaleString('ko-KR')}`);
 text('baseLabel',`${last?.year||'—'} 사업보고서 · ${fsName} · 단위 억원`);
 const items=[
  {title:'연간 매출액',metric:'revenue',icon:'↗',kind:'money'},
  {title:'연간 영업이익',metric:'operatingProfit',icon:'◎',kind:'money'},
  {title:'영업이익률',metric:'operatingMargin',icon:'%',kind:'ratio'},
  {title:'잉여현금흐름 (간이)',metric:'fcf',icon:'◈',kind:'money'}
 ];
 $('kpis').replaceChildren(...items.map(x=>{
  const v=last?.metrics[x.metric],p=prev?.metrics[x.metric];const change=x.kind==='ratio'?(v!=null&&p!=null?v-p:null):percentChange(v,p);
  const card=document.createElement('div');card.className='kpi';
  const top=document.createElement('div');top.className='kpi-top';top.innerHTML=`<span>${x.title}</span><span class="kpi-illustration">${x.icon}</span>`;
  const value=document.createElement('div');value.className='kpi-value';value.textContent=x.kind==='ratio'?pct(v):amt(v,1);if(x.kind!=='ratio'){const unit=document.createElement('small');unit.textContent='억원';value.append(unit);}
  const foot=document.createElement('div');foot.className='kpi-foot';
  const trend=document.createElement('span');trend.className=`trend ${change!=null&&change<0?'negative':''}`;trend.textContent=change==null?'전년 비교 불가':`${change>0?'+':''}${change.toFixed(1)}${x.kind==='ratio'?'%p':'%'}`;
  foot.append(trend,document.createTextNode('전년 대비'));card.append(top,value,foot);return card;
 }));
 renderAnnual();renderQuarter();renderBalance();renderInsights();renderAccounts();
}
function renderTable(id,heads,rows){const table=$(id);table.innerHTML='';const thead=document.createElement('thead'),tr=document.createElement('tr');heads.forEach(h=>tr.append(makeCell('th',h)));thead.append(tr);table.append(thead);const body=document.createElement('tbody');for(const row of rows){const r=document.createElement('tr');row.forEach(v=>r.append(makeCell('td',v)));body.append(r);}table.append(body);}
function renderAnnual(){
 const arr=state.data.annual,m=state.metric;
 text('chartTitle',`${labels[m]} · 연간 실적 / 단위 억원`);
 barChart('annualChart',arr.map(x=>String(x.year)),arr.map(x=>x.metrics[m]),'annual');
 const rows=arr.map((x,i)=>{const v=x.metrics;return [`${x.year}`,amt(v.revenue,1),amt(v.operatingProfit,1),pct(v.operatingMargin),amt(v.netIncome,1),amt(v.cfo,1),amt(v.capex,1),amt(v.fcf,1),i? (percentChange(v.revenue,arr[i-1].metrics.revenue) == null?'—':pct(percentChange(v.revenue,arr[i-1].metrics.revenue))):'—'];});
 renderTable('annualTable',['연도','매출액','영업이익','영업이익률','순이익','영업CF','CAPEX','FCF','매출 성장률'],rows);
}
function barChart(id,categories,values,variant){
 const holder=$(id),w=780,h=variant==='annual'?245:155,base=h-31,top=22,left=22,right=w-19,all=values.filter(x=>x!=null);
 if(!all.length){holder.textContent='표시할 공시 데이터가 없습니다.';return;}
 const posMax=Math.max(0,...all),negMin=Math.min(0,...all),range=Math.max(posMax-negMin,1);
 const y=v=>top+(posMax-v)/range*(base-top);
 const zero=y(0),barGap=(right-left)/Math.max(values.length,1),barW=Math.min(67,barGap*.46);
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-label',`${id} ${categories.join(', ')}`);
 for(let i=0;i<=4;i++) {const y0=top+(base-top)*i/4;const line=document.createElementNS(ns,'line');line.setAttribute('x1',left);line.setAttribute('x2',right);line.setAttribute('y1',y0);line.setAttribute('y2',y0);line.setAttribute('stroke','#edf1f7');line.setAttribute('stroke-width','1');svg.append(line);}
 const fmt=(n)=>{const num=n/KRW_100M;return Math.abs(num)>=1000?`${(num/1000).toFixed(1)}천`:`${num.toFixed(0)}`;};
 values.forEach((v,i)=>{
  const cx=left+barGap*(i+.5),ty=document.createElementNS(ns,'text');ty.setAttribute('x',cx);ty.setAttribute('y',h-6);ty.setAttribute('text-anchor','middle');ty.setAttribute('fill','#8897ab');ty.setAttribute('font-size','12');ty.textContent=categories[i];svg.append(ty);
  if(v==null) return;
  const yv=y(v),rect=document.createElementNS(ns,'rect');rect.setAttribute('x',cx-barW/2);rect.setAttribute('y',Math.min(yv,zero));rect.setAttribute('height',Math.max(Math.abs(zero-yv),2));rect.setAttribute('width',barW);rect.setAttribute('rx',v>=0?'4':'0');rect.setAttribute('fill',v>=0?'#6489e8':'#d98791');svg.append(rect);
  const label=document.createElementNS(ns,'text');label.setAttribute('x',cx);label.setAttribute('y',v>=0?Math.max(top+12,yv-8):Math.min(base-4,yv+17));label.setAttribute('text-anchor','middle');label.setAttribute('fill','#405474');label.setAttribute('font-size','12');label.setAttribute('font-weight','650');label.textContent=fmt(v);svg.append(label);
 });holder.replaceChildren(svg);
}
function renderQuarter(){const q=state.data.quarters;barChart('quarterChart',q.map(x=>`${x.quarter}Q`),q.map(x=>x.metrics.revenue),'quarter');renderTable('quarterTable',['구분','매출액','영업이익','영업이익률','순이익','영업CF'],q.length?q.map(x=>[x.period,amt(x.metrics.revenue,1),amt(x.metrics.operatingProfit,1),pct(x.metrics.operatingMargin),amt(x.metrics.netIncome,1),amt(x.metrics.cfo,1)]):[['아직 분기 데이터를 확인하지 못했습니다.','—','—','—','—','—']]);}
function renderBalance(){const d=state.data,raw=d.quarterlyCumulative.at(-1)||d.annual.at(-1),v=raw?.metrics||{};text('balanceLabel',`${raw?.year||'—'} ${raw?.period||'—'} 기말`);
 const entries=[{name:'부채비율',value:v.debtRatio,caption:`부채 ${amt(v.liabilities,1)} / 자본 ${amt(v.equity,1)}억원`,max:200},{name:'유동비율',value:v.currentRatio,caption:`유동자산 ${amt(v.currentAssets,1)} / 유동부채 ${amt(v.currentLiabilities,1)}억원`,max:300},{name:'현금 및 현금성자산',value:v.cash,caption:`자산총계 ${amt(v.assets,1)}억원`,max:v.assets,denom:'money'}];
 $('balanceDetails').replaceChildren(...entries.map(x=>{const div=document.createElement('div');div.className='balance-item';const caption=document.createElement('div');caption.className='balance-caption';const l=document.createElement('span');l.textContent=x.name;const r=document.createElement('span');r.textContent=x.denom==='money'?fmtMoney(x.value):pct(x.value);caption.append(l,r);
  const track=document.createElement('div');track.className='balance-track';const fill=document.createElement('div');fill.className='balance-fill';fill.style.width=`${Math.min(100,Math.max(0,(x.value||0)/(x.max||1)*100))}%`;track.append(fill);const foot=document.createElement('div');foot.className='balance-numbers';foot.textContent=x.caption;div.append(caption,track,foot);return div;}));
 text('balanceNote','재무상태표는 해당 기말의 잔액이며, 손익계산서처럼 분기 간 차감하지 않습니다. 비율은 공시 수치 기준으로 계산됩니다.');
}
function renderInsights(){const annual=state.data.annual,last=annual.at(-1),prev=annual.at(-2);const insights=[];
 if(last&&prev){const g=percentChange(last.metrics.revenue,prev.metrics.revenue);insights.push({title:'매출 성장',text:g==null?'매출 증가율을 계산할 수 없습니다.':`${last.year}년 매출액은 전년 대비 ${Math.abs(g).toFixed(1)}% ${g>=0?'증가':'감소'}했습니다. 반도체 검사장비의 수주와 매출 인식 시점을 추가 점검할 필요가 있습니다.`});
 const a=last.metrics.operatingMargin,b=prev.metrics.operatingMargin;insights.push({title:'수익성 변화',text:a==null||b==null?'영업이익률을 계산할 수 없습니다.':`${last.year}년 영업이익률은 ${pct(a)}로 전년 ${pct(b)} 대비 ${(a-b)>=0?'+':''}${(a-b).toFixed(1)}%p 변화했습니다. 장비 믹스·원가율·연구개발비를 확인해 보세요.`});}
 else insights.push({title:'연간 실적',text:'2개년 이상의 연간 공시가 있어야 성장률을 산출할 수 있습니다.'});
 if(last){const v=last.metrics;insights.push({title:'현금창출력',text:v.cfo==null?'영업활동현금흐름을 식별하지 못했습니다.':`영업활동현금흐름은 ${fmtMoney(v.cfo)}${v.fcf==null?'이며 CAPEX 계정이 없어 FCF는 미산출입니다.':`, CAPEX 차감 후 간이 FCF는 ${fmtMoney(v.fcf)}입니다.`} 매출채권과 재고자산 변화를 함께 검토해야 합니다.`});}
 $('insights').replaceChildren(...insights.map((x,i)=>{const div=document.createElement('div');div.className='insight';const num=document.createElement('div');num.className='insight-number';num.textContent=`RESEARCH NOTE 0${i+1}`;const h=document.createElement('h3');h.textContent=x.title;const p=document.createElement('p');p.textContent=x.text;div.append(num,h,p);return div;}));
}
function renderAccounts(){const type=$('sourcePeriod').value==='annual'?'annual':'latest',stmt=$('stmtType').value,q=$('accountSearch').value.trim().toLowerCase(),src=state.data.raw[type];if(!src){renderTable('accountTable',['구분','계정과목','당기 (억원)','전기 (억원)','계정 ID'],[]);text('accountCount','0개 계정');text('sourceFooter','해당 기간 공시가 없습니다.');return;}
 const rows=src.rows.filter(x=>(stmt==='ALL'||x.sj_div===stmt)&&(!q||String(x.account_nm||'').toLowerCase().includes(q)||String(x.account_id||'').toLowerCase().includes(q))).slice(0,500);
 renderTable('accountTable',['구분','계정과목','당기 (억원)','전기 (억원)','계정 ID'],rows.map(r=>[r.sj_nm||r.sj_div,r.account_nm,amt(r.thstrm_amount,2),amt(r.frmtrm_amount,2),r.account_id]));text('accountCount',`${rows.length}개 계정${src.rows.length>500?' · 최대 500개 표시':''}`);
 const footer=$('sourceFooter');footer.replaceChildren(document.createTextNode(`${src.report.year} ${src.report.period} · ${state.fs} · 원문 계정 ${src.rows.length}개`));if(src.report.receipt && /^\d{14}$/.test(src.report.receipt)){const link=document.createElement('a');link.href=`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${src.report.receipt}`;link.target='_blank';link.rel='noopener noreferrer';link.textContent='DART 공시 원문 열기 ↗';footer.append(link);}
}
function download(filename,content,mime){const blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function exportCSV(kind){if(!state.data)return;const rows=kind==='annual'?state.data.annual:state.data.quarters;const keys=['revenue','grossProfit','operatingProfit','operatingMargin','netIncome','netMargin','cfo','capex','fcf','assets','liabilities','equity','cash','debtRatio','currentRatio'];const header=[kind==='annual'?'연도':'분기',...keys.map(k=>labels[k]||k)];const values=rows.map(r=>[kind==='annual'?r.year:r.period,...keys.map(k=>r.metrics[k]??'')]);const csv='\ufeff'+[header,...values].map(row=>row.map(cell=>`"${String(cell).replaceAll('"','""')}"`).join(',')).join('\r\n');download(`YC_232140_${kind}_${state.fs}.csv`,csv,'text/csv;charset=utf-8');}
document.addEventListener('DOMContentLoaded',()=>{
 document.querySelectorAll('[data-fs]').forEach(btn=>btn.addEventListener('click',()=>{if(state.fs===btn.dataset.fs)return;state.fs=btn.dataset.fs;document.querySelectorAll('[data-fs]').forEach(x=>x.classList.toggle('selected',x.dataset.fs===state.fs));fetchData();}));
 document.querySelectorAll('[data-metric]').forEach(btn=>btn.addEventListener('click',()=>{state.metric=btn.dataset.metric;document.querySelectorAll('[data-metric]').forEach(x=>x.classList.toggle('active',x.dataset.metric===state.metric));if(state.data)renderAnnual();}));
 $('refreshBtn').addEventListener('click',()=>{state.refreshKey++;fetchData();});
 for(const id of ['sourcePeriod','stmtType','accountSearch'])$(id).addEventListener(id==='accountSearch'?'input':'change',()=>{if(state.data)renderAccounts();});
 $('exportAnnual').addEventListener('click',()=>exportCSV('annual'));$('exportQuarter').addEventListener('click',()=>exportCSV('quarter'));
 $('exportJson').addEventListener('click',()=>{if(!state.data)return;download(`YC_232140_DART_Analysis_${state.fs}.json`,JSON.stringify(state.data,null,2),'application/json');});
 fetchData();
});
