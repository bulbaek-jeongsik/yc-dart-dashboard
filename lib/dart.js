'use strict';

const DART_URL = 'https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json';
const YC = Object.freeze({ name: '와이씨', stockCode: '232140', corpCode: '01109539', sector: '반도체 검사장비' });
const YEAR_START = 2021;
const LAST_COMPLETED_YEAR = 2025;
const REPORTS = Object.freeze([
  { key: 'Q1', name: '1분기', code: '11013', quarter: 1 },
  { key: 'H1', name: '반기', code: '11012', quarter: 2 },
  { key: 'Q3', name: '3분기', code: '11014', quarter: 3 },
]);

class DartError extends Error {
  constructor(message, status = null) { super(message); this.name = 'DartError'; this.status = status; }
}

function amount(value) {
  if (value == null || value === '' || value === '-') return null;
  const normalized = String(value).trim().replace(/,/g, '').replace(/\s/g, '');
  if (!normalized || normalized === '-') return null;
  if (/^\([\d.]+\)$/.test(normalized)) return -Number(normalized.slice(1, -1));
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const MAP = {
  revenue: { section: ['IS', 'CIS'], ids: ['ifrs-full_Revenue','ifrs_Revenue','ifrs-full_RevenueFromContractsWithCustomers'], names: [/^매출액$/, /^매출액\(수익\)$/, /^수익\(매출액\)$/, /^영업수익$/] },
  grossProfit: { section: ['IS', 'CIS'], ids: ['ifrs-full_GrossProfit','ifrs_GrossProfit'], names: [/^매출총이익$/, /^매출총손익$/] },
  operatingProfit: { section: ['IS', 'CIS'], ids: ['dart_OperatingIncomeLoss'], names: [/^영업이익\(?손실\)?$/, /^영업이익\(손실\)$/, /^영업손익$/] },
  netIncome: { section: ['IS', 'CIS'], ids: ['ifrs-full_ProfitLoss','ifrs_ProfitLoss'], names: [/^당기순이익\(손실\)$/, /^당기순이익$/, /^당기순손익$/, /^분기순이익\(손실\)$/, /^반기순이익\(손실\)$/] },
  assets: { section: ['BS'], ids: ['ifrs-full_Assets','ifrs_Assets'], names: [/^자산총계$/] },
  liabilities: { section: ['BS'], ids: ['ifrs-full_Liabilities','ifrs_Liabilities'], names: [/^부채총계$/] },
  equity: { section: ['BS'], ids: ['ifrs-full_Equity','ifrs_Equity'], names: [/^자본총계$/] },
  currentAssets: { section: ['BS'], ids: ['ifrs-full_CurrentAssets','ifrs_CurrentAssets'], names: [/^유동자산$/] },
  currentLiabilities: { section: ['BS'], ids: ['ifrs-full_CurrentLiabilities','ifrs_CurrentLiabilities'], names: [/^유동부채$/] },
  cash: { section: ['BS'], ids: ['ifrs-full_CashAndCashEquivalents','ifrs_CashAndCashEquivalents'], names: [/^현금및현금성자산$/] },
  cfo: { section: ['CF'], ids: ['ifrs-full_CashFlowsFromUsedInOperatingActivities','ifrs_CashFlowsFromUsedInOperatingActivities'], names: [/^영업활동현금흐름$/, /^영업활동으로\s*인한\s*현금흐름$/, /^영업활동으로\s*인한\s*순현금흐름$/] },
};

function selectMetric(rows, key) {
  const def = MAP[key];
  const scoped = rows.filter(r => def.section.includes(r.sj_div) && (!r.account_detail || r.account_detail === '-'));
  for (const sj of def.section) {
    const current = scoped.filter(r => r.sj_div === sj);
    for (const id of def.ids) {
      const row = current.find(r => r.account_id === id && amount(r.thstrm_amount) !== null);
      if (row) return amount(row.thstrm_amount);
    }
    for (const regex of def.names) {
      const row = current.find(r => regex.test(String(r.account_nm || '').replace(/\s/g, '')) && amount(r.thstrm_amount) !== null);
      if (row) return amount(row.thstrm_amount);
    }
  }
  return null;
}

function capexAmount(rows) {
  const cf = rows.filter(r => r.sj_div === 'CF' && (!r.account_detail || r.account_detail === '-'));
  const purchaseTypes = [
    { ids: ['ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities','ifrs_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities','dart_PurchaseOfPropertyPlantAndEquipment'], regex: /^(유형자산|유형자산및투자부동산)의?(취득|취득으로인한현금유출)$/ },
    { ids: ['ifrs-full_PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities','ifrs_PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities','dart_PurchaseOfIntangibleAssets'], regex: /^무형자산의?(취득|취득으로인한현금유출)$/ }
  ];
  let sum = 0, found = false;
  for (const type of purchaseTypes) {
    const r = cf.find(x => type.ids.includes(x.account_id) && amount(x.thstrm_amount) !== null) ||
      cf.find(x => type.regex.test(String(x.account_nm || '').replace(/\s/g,'')) && amount(x.thstrm_amount) !== null);
    if (r) { sum += Math.abs(amount(r.thstrm_amount)); found = true; }
  }
  return found ? sum : null;
}

function summarize(rows, year, period, fs) {
  const metrics = {};
  for (const name of Object.keys(MAP)) metrics[name] = selectMetric(rows, name);
  metrics.capex = capexAmount(rows);
  metrics.fcf = metrics.cfo !== null && metrics.capex !== null ? metrics.cfo - metrics.capex : null;
  metrics.operatingMargin = divide(metrics.operatingProfit, metrics.revenue, 100);
  metrics.netMargin = divide(metrics.netIncome, metrics.revenue, 100);
  metrics.debtRatio = divide(metrics.liabilities, metrics.equity, 100);
  metrics.currentRatio = divide(metrics.currentAssets, metrics.currentLiabilities, 100);
  return { year, period, fs, metrics, receipt: rows.find(r => r.rcept_no)?.rcept_no || null, recordCount: rows.length };
}

function divide(a,b,multiplier = 1) { return a === null || b === null || b === 0 ? null : (a / b) * multiplier; }
function diff(a,b) { return a == null || b == null ? null : a-b; }
function yearlyGrowth(newValue, oldValue) { return newValue == null || oldValue == null || oldValue === 0 ? null : (newValue/Math.abs(oldValue)-1)*100; }

function buildQuarters(reports) {
  const result = [];
  const flows = new Set(['revenue','grossProfit','operatingProfit','netIncome','cfo','capex','fcf']);
  let previous = null;
  for (const report of reports) {
    const metrics = { ...report.metrics };
    for (const field of flows) metrics[field] = previous ? diff(report.metrics[field], previous.metrics[field]) : report.metrics[field];
    metrics.operatingMargin = divide(metrics.operatingProfit, metrics.revenue, 100);
    metrics.netMargin = divide(metrics.netIncome, metrics.revenue, 100);
    result.push({ year: report.year, quarter: result.length + 1, period: `${report.year} ${result.length + 1}Q`, metrics, receipt: report.receipt, fs: report.fs, source: report.period });
    previous = report;
  }
  return result;
}

async function getStatement(key, year, reportCode, fs, fetchImpl=global.fetch) {
  const qs = new URLSearchParams({crtfc_key:key,corp_code:YC.corpCode,bsns_year:String(year),reprt_code:reportCode,fs_div:fs});
  let response;
  try { response = await fetchImpl(`${DART_URL}?${qs}`, {headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)}); }
  catch { throw new DartError(`DART 서버 연결에 실패했습니다 (${year}, ${reportCode}).`); }
  if (!response.ok) throw new DartError(`DART HTTP 오류 (${response.status}).`);
  let data;
  try { data = await response.json(); }
  catch { throw new DartError('DART 응답을 JSON으로 읽지 못했습니다.'); }
  if (data.status === '013') return null;
  if (data.status !== '000' || !Array.isArray(data.list)) throw new DartError(`DART 응답: ${data.message || '알 수 없는 오류'} (${data.status || '?'})`, data.status);
  return data.list;
}

async function loadData(apiKey, fs='CFS', fetchImpl=global.fetch) {
  if (!/^[a-zA-Z0-9]{40}$/.test(apiKey || '')) throw new DartError('DART_API_KEY가 없거나 40자리 형식이 아닙니다. Vercel 환경변수에 등록하세요.');
  if (!['CFS','OFS'].includes(fs)) throw new DartError('잘못된 재무제표 구분입니다.');
  const annualSpecs = Array.from({length:LAST_COMPLETED_YEAR-YEAR_START+1}, (_,i)=>({year:YEAR_START+i,period:'FY',code:'11011'}));
  const quarterSpecs = REPORTS.map(x=>({year:2026,period:x.key,code:x.code}));
  const specs = [...annualSpecs,...quarterSpecs];
  const settled = await Promise.allSettled(specs.map(s=>getStatement(apiKey,s.year,s.code,fs,fetchImpl)));
  const issues = [];
  const all = settled.map((result,i)=>{
    const spec=specs[i];
    if (result.status==='rejected') {issues.push(`${spec.year} ${spec.period}: ${result.reason.message}`);return null;}
    if (!result.value) return null;
    return { ...summarize(result.value,spec.year,spec.period,fs), rows: result.value };
  });
  const annual = all.slice(0,annualSpecs.length).filter(Boolean);
  const quarterlyCumulative = all.slice(annualSpecs.length).filter(Boolean);
  // A missing earlier cumulative filing invalidates difference-based quarters after the gap.
  const contiguous = [];
  for(let i=0;i<quarterSpecs.length;i++) {
    if(!all[annualSpecs.length+i]) break;
    contiguous.push(all[annualSpecs.length+i]);
  }
  const quarters=buildQuarters(contiguous);
  const latest=quarterlyCumulative.at(-1) || annual.at(-1) || null;
  const latestAnnual=annual.at(-1) || null;
  const stripRows = obj => {if(!obj) return null; const {rows,...others}=obj;return others;};
  const raw = {
    annual: latestAnnual ? { report: stripRows(latestAnnual), rows: latestAnnual.rows.map(exposeAccount) } : null,
    latest: latest ? { report: stripRows(latest), rows: latest.rows.map(exposeAccount) } : null
  };
  return {
    company: YC, fs, asOf: new Date().toISOString(),
    units: {money:'KRW',display:'억원',pct:'%'},
    annual: annual.map(stripRows), quarterlyCumulative: quarterlyCumulative.map(stripRows), quarters,
    raw, issues,
    notes: ['연간 비교는 연결(CFS) 또는 별도(OFS) 중 사용자가 선택한 동일 기준만 사용합니다.',
      '2026년 분기 손익·현금흐름은 1분기, 반기, 3분기 누적 공시를 차감해 환산합니다.',
      'CAPEX는 현금흐름표의 유형자산·무형자산 취득 현금유출만 합산한 간이 추정치입니다.',
      '개별 계정 식별이 불가능한 수치는 임의로 채우지 않고 미표시합니다.']
  };
}
function exposeAccount(row) {
  return {sj_div:row.sj_div,sj_nm:row.sj_nm,account_id:row.account_id,account_nm:row.account_nm,account_detail:row.account_detail,thstrm_amount:amount(row.thstrm_amount),frmtrm_amount:amount(row.frmtrm_amount),bfefrmtrm_amount:amount(row.bfefrmtrm_amount),ord:row.ord};
}
module.exports={ YC, MAP, amount, selectMetric, capexAmount, summarize, buildQuarters, yearlyGrowth, getStatement, loadData, DartError };
