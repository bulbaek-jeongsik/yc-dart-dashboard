'use strict';
// All filing categories are served by the OpenDART list API with last_reprt_at=N.
(()=>{
 const $=id=>document.getElementById(id);
 const st={page:1,total:0,totalPages:0,filings:[],collecting:false,cancel:false,reader:{receipt:null,token:null,part:0,chunk:1,result:null,title:''},query:null};
 const labels={A:'정기공시',B:'주요사항',C:'발행공시',D:'지분공시',E:'기타공시',F:'외부감사',G:'펀드공시',H:'자산유동화',I:'거래소공시',J:'공정위공시'};
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 $('archiveEnd').value=today;
 const date=s=>(s||'').replaceAll('-','');
 const currentFilters=()=>({from:date($('archiveStart').value),to:date($('archiveEnd').value),category:$('archiveType').value});
 const params=q=>new URLSearchParams(q);
 async function getJSON(path){const r=await fetch(path);const ct=r.headers.get('content-type')||'';const d=ct.includes('json')?await r.json():{error:`서버 응답이 올바르지 않습니다 (HTTP ${r.status}).`};if(!r.ok)throw new Error(d.error||'API 호출 실패');return d;}
 const msg=m=>{$('archiveStatus').textContent=m;};
 const cell=(tag,value)=>{const x=document.createElement(tag);x.textContent=value??'—';return x;};
 const formatDate=d=> /^\d{8}$/.test(d||'')?`${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}`:d;
 const safeUrl=receipt=>`https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(receipt)}`;
 function renderRows(){
  const keyword=$('archiveKeyword').value.trim().toLocaleLowerCase();
  const rows=st.filings.filter(f=>!keyword||`${f.report_nm||''} ${f.flr_nm||''} ${f.type||''}`.toLocaleLowerCase().includes(keyword));
  const tbody=$('filingsBody');tbody.replaceChildren();
  if(!rows.length){const tr=document.createElement('tr');const td=cell('td',st.total===0?'조회된 공시가 없습니다.':'현재 페이지에서 검색 결과가 없습니다.');td.colSpan=5;tr.append(td);tbody.append(tr);}
  rows.forEach(f=>{
   const tr=document.createElement('tr');tr.append(cell('td',formatDate(f.rcept_dt)));
   const type=cell('td',f.type||'기타');type.className='archive-type';tr.append(type);
   const title=cell('td',f.report_nm);title.className='archive-report';title.title='클릭하면 텍스트 원문을 엽니다';title.tabIndex=0;title.setAttribute('role','button');title.onclick=()=>openReader(f);title.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openReader(f);}};tr.append(title);
   tr.append(cell('td',f.flr_nm));const source=document.createElement('td');const link=document.createElement('a');link.href=safeUrl(f.rcept_no);link.target='_blank';link.rel='noopener noreferrer';link.textContent='DART ↗';source.append(link);tr.append(source);tbody.append(tr);
  });
  $('filingCount').textContent=`총 ${Number(st.total).toLocaleString('ko-KR')}건 · ${rows.length}건 표시`;
  $('filingsPage').textContent=st.totalPages?`${st.page} / ${st.totalPages} 페이지`:'0건';
  $('filingsPrev').disabled=st.page<=1||st.collecting;$('filingsNext').disabled=st.page>=st.totalPages||st.collecting;
 }
 async function loadPage(page=1){
  const query=currentFilters();st.query=query;st.page=page;
  msg('DART 공시 목록 조회 중…');$('archiveSearch').disabled=true;
  try{const d=await getJSON(`/api/disclosures?${params({...query,page})}`);st.total=d.total;st.totalPages=d.totalPages;st.filings=d.filings;renderRows();msg(`${formatDate(query.from)} ~ ${formatDate(query.to)} · ${query.category==='ALL'?'모든 공시 유형':labels[query.category]} · 정정 포함`);}
  catch(e){st.filings=[];st.total=0;st.totalPages=0;renderRows();msg(`조회 실패: ${e.message}`);}
  finally{$('archiveSearch').disabled=false;}
 }
 function download(name,txt,mime){const blob=new Blob([txt],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
 function csv(records){const columns=['rcept_dt','report_nm','type','flr_nm','rcept_no','corp_name','viewer'];return '\ufeff'+[columns,...records.map(f=>columns.map(c=>f[c]??''))].map(row=>row.map(x=>`"${String(x).replaceAll('"','""')}"`).join(',')).join('\r\n');}
 async function collectAll(){
  if(st.collecting)return;const filter=currentFilters();st.collecting=true;st.cancel=false;$('archiveCollect').disabled=true;$('archiveCancel').hidden=false;renderRows();
  const all=[];let pages=0;
  try{
   let totalPages=1;
   while(pages<totalPages){
    if(st.cancel)break;
    const result=await getJSON(`/api/disclosures?${params({...filter,page:pages+1})}`);
    if(pages===0)totalPages=result.totalPages;
    if(result.filings.length===0)break;
    all.push(...result.filings);pages++;
    msg(`전체 공시 목록 수집: ${pages}/${totalPages} 페이지 · ${all.length}건`);
    if(pages<totalPages)await new Promise(resolve=>setTimeout(resolve,250));
   }
   if(all.length){const id=`YC_232140_disclosures_${filter.from}_${filter.to}`;const payload={company:{name:'와이씨',stockCode:'232140',corpCode:'01109539'},source:'OpenDART list.json',filters:filter,downloadedAt:new Date().toISOString(),complete:!st.cancel&&pages>=totalPages,reportedTotal:pages?all.length:null,filings:all};download(`${id}.json`,JSON.stringify(payload,null,2),'application/json');download(`${id}.csv`,csv(all),'text/csv;charset=utf-8');}
   msg(st.cancel?`수집 중단: ${all.length}건의 부분 목록을 저장했습니다.`:`공시 목록 ${all.length}건을 JSON·CSV로 저장했습니다. 각 원문은 별도로 열어야 합니다.`);
  }catch(e){msg(`전체 목록 수집 오류: ${e.message} (${all.length}건까지 수집)`);if(all.length)download('YC_232140_disclosures_partial.json',JSON.stringify({complete:false,filings:all},null,2),'application/json');}
  finally{st.collecting=false;st.cancel=false;$('archiveCollect').disabled=false;$('archiveCancel').hidden=true;renderRows();}
 }
 async function openReader(f){
  st.reader={receipt:f.rcept_no,token:f.token,title:f.report_nm,part:0,chunk:1,result:null};
  $('documentReader').hidden=false;$('readerTitle').textContent=f.report_nm;
  $('readerMeta').textContent=`접수일 ${formatDate(f.rcept_dt)} · 접수번호 ${f.rcept_no} · 제출인 ${f.flr_nm||'—'}`;
  $('readerOfficial').href=safeUrl(f.rcept_no);
  $('readerPart').replaceChildren();$('readerText').textContent='';$('readerLength').textContent='';$('readerNotice').textContent='DART 공시 원문을 가져오는 중입니다.';
  $('documentReader').scrollIntoView({behavior:'smooth',block:'start'});
  await loadDocument();
 }
 async function loadDocument(){
  const req={...st.reader}; if(!req.receipt)return;
  $('readerPrev').disabled=true;$('readerNext').disabled=true;
  $('readerNotice').textContent='DART 원문 ZIP을 확인하고 텍스트를 추출하는 중입니다…';
  try{
   const result=await getJSON(`/api/document?${params({receipt:req.receipt,token:req.token,part:req.part,chunk:req.chunk})}`);
   if(st.reader.receipt!==req.receipt||st.reader.part!==req.part||st.reader.chunk!==req.chunk)return;
   st.reader.result=result;
   $('readerPart').replaceChildren(...result.parts.map(p=>{const opt=document.createElement('option');opt.value=String(p.index);opt.textContent=`${p.index+1}. ${p.name} (${Math.round(p.bytes/1024)}KB)`;return opt;}));
   $('readerPart').value=String(result.selectedPart);
   $('readerText').textContent=result.text||'추출할 텍스트가 없습니다. 공식 원문 뷰어를 확인하세요.';
   $('readerLength').textContent=`${result.totalCharacters.toLocaleString('ko-KR')}자 · 총 ${result.parts.length}개 원문 구성 파일`;
   $('readerPage').textContent=`${result.chunk}/${result.totalChunks} 본문 조각`;
   $('readerPrev').disabled=result.chunk<=1;$('readerNext').disabled=result.chunk>=result.totalChunks;
   $('readerNotice').textContent=result.notice;
  }catch(e){$('readerText').textContent='';$('readerNotice').textContent=`원문 미리보기 불가: ${e.message}. DART 원문 링크에서 확인하세요.`;$('readerPage').textContent='미리보기 오류';}
 }
 async function downloadOriginal(){
  const receipt=st.reader.receipt,token=st.reader.token;if(!receipt)return;
  $('readerZip').disabled=true;
  try{const resp=await fetch(`/api/document?${params({receipt,token,format:'zip'})}`);if(!resp.ok){const d=await resp.json();throw new Error(d.error||`HTTP ${resp.status}`);}const blob=await resp.blob();const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`DART_${receipt}.zip`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  catch(e){$('readerNotice').textContent=`ZIP 다운로드 실패: ${e.message} DART 공식 원문 뷰어를 이용하세요.`;}
  finally{$('readerZip').disabled=false;}
 }
 $('archiveForm').addEventListener('submit',e=>{e.preventDefault();$('archiveKeyword').value='';loadPage(1);});
 $('archiveKeyword').addEventListener('input',renderRows);
 $('filingsPrev').addEventListener('click',()=>loadPage(st.page-1));$('filingsNext').addEventListener('click',()=>loadPage(st.page+1));
 $('archiveCollect').addEventListener('click',collectAll);$('archiveCancel').addEventListener('click',()=>{st.cancel=true;msg('현재 페이지 요청이 끝나면 수집을 중단합니다.');});
 $('readerClose').addEventListener('click',()=>{$('documentReader').hidden=true;st.reader.receipt=null;});
 $('readerPart').addEventListener('change',()=>{st.reader.part=Number($('readerPart').value);st.reader.chunk=1;loadDocument();});
 $('readerPrev').addEventListener('click',()=>{st.reader.chunk--;loadDocument();});$('readerNext').addEventListener('click',()=>{st.reader.chunk++;loadDocument();});
 $('readerCopy').addEventListener('click',async()=>{if(st.reader.result)try{await navigator.clipboard.writeText(st.reader.result.text);$('readerNotice').textContent='현재 원문 텍스트를 복사했습니다.';}catch{$('readerNotice').textContent='복사하지 못했습니다. 본문을 직접 선택해 복사하세요.';}});
 async function downloadReaderTxt(){
  const {receipt,token,part,result}=st.reader;if(!receipt||!result)return;
  $('readerTxt').disabled=true;
  try{
   const chunks=[];
   for(let i=1;i<=result.totalChunks;i++){
    const d=i===result.chunk?result:await getJSON(`/api/document?${params({receipt,token,part,chunk:i})}`);
    chunks.push(d.text);
    $('readerNotice').textContent=`본문 TXT 다운로드 준비 ${i}/${result.totalChunks}…`;
   }
   const clean=(result.parts[part]?.name||'main').replace(/[^\w가-힣.-]+/g,'_');
   download(`DART_${receipt}_${clean}.txt`,chunks.join(''),'text/plain;charset=utf-8');
   $('readerNotice').textContent='선택한 구성 파일의 원문 텍스트를 저장했습니다. 표·이미지 등은 DART 뷰어로 교차검증하세요.';
  }catch(e){$('readerNotice').textContent=`TXT 다운로드 실패: ${e.message}`;}
  finally{$('readerTxt').disabled=false;}
 }
 $('readerTxt').addEventListener('click',downloadReaderTxt);
 $('readerZip').addEventListener('click',downloadOriginal);
 loadPage(1);
})();
