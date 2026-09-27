import {finite,percent,bytes,stateOf,selectNodes,duration,escapeHTML as esc,aggregate,recentAggregate,regionCode,regionName,pingSummary,rankTraffic,fleetHealth,regionCoverage,placePopover,usageLevel} from './data.js';
import {drawChart} from './charts.js';
import {createGlobe} from './globe.js';
const $=id=>document.getElementById(id),labels={online:'在线',offline:'离线',stale:'数据过期',loading:'等待数据'};
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let nodes=[],reports={},filter='all',lastSuccess=0,busy=false,failed=false,selected=null;
let historyRequest=null,pingRequest=null,historyRows=[],historySignature='',pingLoaded='';
let heartbeatAnimation=null,lastHeartbeat=0;
let inspectedSample=null,showAllRanks=false,rankPinned=false,rankPointer=null,rankHideTimer=null,peekHideTimer=null,peekNode=null,peekMode='mouse';
let samples=[],globe=null,primed=false,tasks=[],latestAggregate=null;
const timeLabel=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('zh-CN',{hour12:false}):'暂无上报';
const text=(id,value)=>{const el=$(id);if(el.textContent===String(value))return;el.textContent=value;if(el.matches('.metric-number, .metric-number>span:first-child, .traffic-numbers strong, .live-reading strong')&&!reduced.matches)el.animate([{opacity:.45,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:320,easing:'ease-out'});};
async function request(path,options={}){
 const response=await fetch(path,{...options,signal:options.signal||AbortSignal.timeout(15000),credentials:'same-origin',cache:'no-store'});
 if(!response.ok)throw new Error(response.status===401||response.status===403?'站点需要登录，请通过控制台登录后查看。':`数据请求失败（${response.status}），可稍后重试。`);
 const result=await response.json();if(result.error||result.status==='error')throw new Error(result.error?.message||result.message||'无法获取监控数据');return result;
}
function markError(message){failed=true;$('error').hidden=false;text('error',message);$('detail-error').hidden=false;text('detail-error',message);text('connection','连接中断');$('connection').className='connection failed';updateHealth();}
function metric(label,value,kind=''){const v=finite(value)?value:null,level=usageLevel(v);return `<div class="resource ${kind}" data-usage="${level}"><div class="resource-row"><span>${esc(label)}</span><strong>${v===null?'—':v.toFixed(1)+'%'}</strong></div><div class="track" aria-hidden="true"><span style="width:${v===null?0:Math.max(0,Math.min(v,100))}%"></span></div></div>`;}
function card(n){const r=reports[n.uuid],state=stateOf(r),live=state==='online',ram=live?percent(r.ram,r.ram_total):null,disk=live?percent(r.disk,r.disk_total):null;return `<a href="/instance/${encodeURIComponent(n.uuid)}" aria-label="${esc(n.name)}，打开节点详情" aria-describedby="node-peek" class="node-card ${live?'':'is-offline'}" data-uuid="${esc(n.uuid)}"><div class="card-head"><div class="node-icon" aria-hidden="true">${esc(n.region||'◈')}</div><div class="node-title"><h3 title="${esc(n.name)}">${esc(n.name)}</h3><p title="${esc(n.os)}">${esc((n.os||'未知系统').replace('GNU/Linux',''))} · ${esc(n.arch||'—')}</p></div><span class="badge ${state}">${labels[state]}</span></div>${metric('CPU · '+(n.cpu_cores??'—')+' 核',live?r.cpu:null)}${metric('内存 · '+bytes(n.mem_total),ram,'memory')}${metric('磁盘 · '+bytes(n.disk_total),disk,'disk')}<div class="card-network"><div><span><i>↑</i>上传速率</span><strong>${live&&finite(r.net_out)?bytes(r.net_out)+'/s':'—'}</strong></div><div><span><i>↓</i>下载速率</span><strong>${live&&finite(r.net_in)?bytes(r.net_in)+'/s':'—'}</strong></div></div><div class="card-bottom"><span>${live?'运行 '+duration(r.uptime):state==='stale'?'最后上报 '+timeLabel(r.time):'等待探针连接'}</span><span class="card-enter-arrow" aria-hidden="true">↗</span></div></a>`;}
function updateHealth(){
 const health=fleetHealth(nodes,reports,{lastSuccess,failed});$('health-card').dataset.health=health.state;
 text('health-label',health.title);text('online-note',health.note);
 const known=!['loading','disconnected','empty'].includes(health.state);$('health-distribution').setAttribute('aria-label',health.note);for(const kind of ['online','offline','stale'])$('health-'+kind).style.width=known?`${health[kind]/nodes.length*100}%`:'0%';
 const coverage=regionCoverage(nodes,globe?.regionCodes||[]),coverageKnown=!!globe&&!!lastSuccess;const coverageNote=coverageKnown?`${coverage.lit} 有节点 · ${coverage.unlit} 无节点`:'地区状态暂不可确认';text('coverage-note',coverageNote);$('coverage-bar').setAttribute('aria-label',coverageNote);for(const kind of ['lit','unlit'])$('coverage-'+kind).style.width=coverageKnown&&coverage.total?`${coverage[kind]/coverage.total*100}%`:'0%';
 const active=health.online>0&&['healthy','degraded','stale'].includes(health.state);
 $('heartbeat-path').setAttribute('d',active?'M0 12H25L31 8L38 17L46 2L54 22L61 9L67 12H100':'M0 12H100');
 text('heartbeat-text',health.state==='disconnected'?'同步中断，心跳暂停':active?(lastHeartbeat?`上报心跳 · ${Math.floor((Date.now()-lastHeartbeat)/1000)} 秒前`:'等待新的节点上报'):health.state==='offline'?'未收到在线节点心跳':'等待节点上报');
 if(!active){heartbeatAnimation?.cancel();heartbeatAnimation=null;}
 if(['disconnected','loading'].includes(health.state))text('online-count','—');
}
function beat(){
 lastHeartbeat=Date.now();updateHealth();heartbeatAnimation?.cancel();
 if(!reduced.matches)heartbeatAnimation=$('heartbeat').animate([{opacity:.4,transform:'scaleY(.65)'},{opacity:1,transform:'scaleY(1.15)',offset:.45},{opacity:.75,transform:'scaleY(1)'}],{duration:850,easing:'ease-out'});
}
function render(){
 const summary=aggregate(nodes,reports),regions=[...new Set(nodes.map(n=>regionCode(n.region)).filter(Boolean))];
 text('online-count',lastSuccess?summary.online:'—');text('total-count',' / '+nodes.length);
 updateHealth();
 text('avg-cpu',finite(summary.cpu)?summary.cpu.toFixed(1)+'%':'—');$('avg-cpu').closest('article').dataset.usage=usageLevel(summary.cpu);$('memory-percent').closest('article').dataset.usage=usageLevel(summary.ram);
 text('memory-percent',finite(summary.ram)?summary.ram.toFixed(1)+'%':'—');text('memory-total',`${bytes(summary.ramUsed)} / ${bytes(summary.ramTotal)} · 在线节点`);
 for(const [id,key]of [['live-up','up'],['live-down','down']])text(id,finite(summary[key])?bytes(summary[key])+'/s':'—');
 text('regions-count',regions.length);
 text('filter-online',summary.online);text('filter-offline',lastSuccess?nodes.length-summary.online:'—');
 const list=selectNodes(nodes,reports,{filter,search:$('search').value,group:$('group').value,sort:$('sort').value});text('visible-count',list.length);
 // Keep card anchors stable so hover, focus and native link actions survive polling.
 const existing=new Map([...$('cards').querySelectorAll('.node-card')].map(el=>[el.dataset.uuid,el]));
 if(!list.length){$('cards').innerHTML=`<div class="empty">${nodes.length?'没有找到符合条件的节点':'暂无节点'}${nodes.length?'<button id="clear">清除筛选</button>':''}</div>`;}
 else {if(!existing.size)$('cards').replaceChildren();for(const [index,n]of list.entries()){const template=document.createElement('template');template.innerHTML=card(n);const fresh=template.content.firstElementChild;let el=existing.get(n.uuid);if(el){el.className=fresh.className;el.replaceChildren(...fresh.childNodes);existing.delete(n.uuid);}else el=fresh;if($('cards').children[index]!==el)$('cards').insertBefore(el,$('cards').children[index]||null);}for(const el of existing.values())el.remove();}
 $('cards').setAttribute('aria-busy','false');globe?.update(nodes,reports);if(selected)updateDetail();
}
function drawTrends(){
 const seconds=Number($('live-window').value),end=Date.now(),start=end-seconds*1000,rows=samples.filter(s=>s.t>=start&&s.t<=end),options={start,end,gap:12000,seconds:true};
 const network=[{key:'up',name:'上传',color:'#0071e3'},{key:'down',name:'下载',color:'#8b79cf'}];
 drawChart($('live-chart'),rows,network,{...options,format:v=>bytes(v)+'/s',label:'实时网络速率',empty:'正在积累真实采样，首次数据即将到达',note:'5 秒采样',externalTooltip:true,onInspect:(row,pointer)=>{if(rankPinned&&!pointer?.pin)return;clearTimeout(rankHideTimer);rankPinned=!!pointer?.pin;rankPointer=pointer;inspectedSample=row;paintRanking();},onInspectEnd:()=>{if(!rankPinned)hideRanking();}});
 drawChart($('memory-trend'),rows,[{key:'ram',name:'内存',color:'#429a9c'}],{...options,max:100,mini:true,height:65,label:'在线节点内存使用趋势'});
 drawChart($('cpu-trend'),rows,[{key:'cpu',name:'CPU',color:'#8b79cf'}],{...options,mini:true,height:65,label:'CPU 短时趋势'});
 const times=rows.filter(r=>finite(r.up)).map(r=>r.t),peak=rows.flatMap(r=>[r.up,r.down]).filter(finite);
 text('trend-note',times.length>1?`${Math.min(seconds,Math.round((end-Math.min(...times))/1000))} 秒真实记录 · 当前在线节点汇总`:'正在积累采样 · 每 5 秒更新');text('trend-peak',peak.length?'峰值 '+bytes(Math.max(...peak))+'/s':'峰值 —');
}
function paintRanking(){
 if(!inspectedSample)return;const sample=inspectedSample;$('traffic-ranking').hidden=false;$('traffic-ranking').dataset.pinned=String(rankPinned);$('ranking-close').hidden=!rankPinned;text('ranking-close','关闭');
 text('ranking-title',new Date(sample.t).toLocaleTimeString('zh-CN',{hour12:false})+' · 节点排行');
 text('ranking-note',`↑ ${bytes(sample.up)}/s · ↓ ${bytes(sample.down)}/s · ${rankPinned?'已固定采样':'点击曲线固定查看'}`);
 const limit=showAllRanks?Infinity:5;
 $('ranking-lists').innerHTML=[['up','↑ 上传排行'],['down','↓ 下载排行']].map(([key,title])=>{const rows=rankTraffic(sample,key,limit);return `<div><h4>${title}</h4><ol>${rows.map(r=>`<li><span title="${esc(r.name)}">${esc(r.name)}</span><strong>${bytes(r[key])}/s</strong></li>`).join('')||'<li>该采样无节点明细</li>'}</ol></div>`;}).join('');
 $('ranking-all').hidden=!rankPinned||(sample.contributors?.length||0)<=5;text('ranking-all',showAllRanks?'仅显示前 5 名':'显示全部节点');positionRanking();
}
$('ranking-all').onclick=()=>{showAllRanks=!showAllRanks;paintRanking();};$('ranking-close').onclick=hideRanking;
function positionFloating(el,rect){
 const box=el.getBoundingClientRect(),pos=placePopover(rect,{width:box.width,height:box.height},{width:innerWidth,height:innerHeight});
 el.style.left=pos.left+'px';el.style.top=pos.top+'px';
}
function positionRanking(){const box=$('live-chart').getBoundingClientRect();positionFloating($('traffic-ranking'),rankPointer&&rankPointer.type!=='keyboard'?{left:rankPointer.x,right:rankPointer.x,top:rankPointer.y,bottom:rankPointer.y}:box);}
function hideRanking(){clearTimeout(rankHideTimer);$('traffic-ranking').hidden=true;inspectedSample=null;rankPinned=false;showAllRanks=false;}
function scheduleRankHide(){clearTimeout(rankHideTimer);rankHideTimer=setTimeout(hideRanking,160);}
$('traffic-ranking').onpointerenter=()=>clearTimeout(rankHideTimer);
$('traffic-ranking').onpointerleave=()=>{if(!rankPinned)hideRanking();};
function hideNodePeek(){clearTimeout(peekHideTimer);$('node-peek').hidden=true;peekNode=null;}
function schedulePeekHide(){if(peekMode==='keyboard'&&document.activeElement===peekNode)return;clearTimeout(peekHideTimer);peekHideTimer=setTimeout(hideNodePeek,160);}
function showNodePeek(anchor){
 const n=nodes.find(n=>n.uuid===anchor.dataset.uuid);if(!n)return;clearTimeout(peekHideTimer);peekNode=anchor;const r=reports[n.uuid],live=stateOf(r)==='online';
 const pairs=[['处理器型号',n.cpu_name||'未上报'],['内核 / 虚拟化',[n.kernel_version,n.virtualization].filter(Boolean).join(' · ')||'未上报'],['负载 1 / 5 / 15 分钟',[r?.load,r?.load5,r?.load15].map(fmt).join(' / ')],['进程 / TCP / UDP',[r?.process,r?.connections,r?.connections_udp].map(fmt).join(' / ')],['交换空间',bytes(r?.swap)+' / '+bytes(n.swap_total)],['磁盘实际用量',bytes(r?.disk)+' / '+bytes(n.disk_total)],['累计上传',bytes(r?.net_total_up)],['累计下载',bytes(r?.net_total_down)],['最近上报',timeLabel(r?.time)]];
 if(n.price>0)pairs.push(['费用',`${n.currency||''}${n.price} / ${n.billing_cycle||'—'} 天`]);if(n.expired_at)pairs.push(['到期时间',timeLabel(n.expired_at)]);if(n.public_remark)pairs.push(['公开备注',n.public_remark]);
 const el=$('node-peek');el.innerHTML=`<div class="peek-heading"><strong>${esc(n.name)}</strong><span class="badge ${stateOf(r)}">${labels[stateOf(r)]}</span></div><p>${live?'实时运行明细':'当前不在线，以下为可用的最后上报数据'}</p><dl class="spec-list">${specification(pairs)}</dl><small>点击节点卡片，查看历史曲线与网络质量。</small>`;el.hidden=false;positionFloating(el,anchor.getBoundingClientRect());
}
$('cards').addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const anchor=e.target.closest('.node-card');if(anchor&&anchor!==e.relatedTarget?.closest?.('.node-card')){const focused=document.activeElement?.closest?.('.node-card');if(focused?.matches(':focus-visible')&&focused!==anchor)return;peekMode='mouse';showNodePeek(anchor);}});
$('cards').addEventListener('pointerout',e=>{const anchor=e.target.closest('.node-card');if(anchor&&anchor!==e.relatedTarget?.closest?.('.node-card')){const r=anchor.getBoundingClientRect();if(e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom)return;schedulePeekHide();}});
$('cards').addEventListener('focusin',e=>{const anchor=e.target.closest('.node-card');if(anchor){peekMode='keyboard';showNodePeek(anchor);}});$('cards').addEventListener('focusout',()=>{peekMode='mouse';schedulePeekHide();});
$('node-peek').onpointerenter=()=>clearTimeout(peekHideTimer);$('node-peek').onpointerleave=schedulePeekHide;
window.addEventListener('scroll',()=>{const focused=document.activeElement?.closest?.('.node-card');if(focused?.matches(':focus-visible')){peekMode='keyboard';requestAnimationFrame(()=>showNodePeek(focused));}else hideNodePeek();hideRanking();},{passive:true});window.addEventListener('resize',()=>{hideNodePeek();hideRanking();});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){hideNodePeek();hideRanking();}});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('#live-chart,#traffic-ranking'))hideRanking();if(!e.target.closest('.node-card,#node-peek'))hideNodePeek();});
async function primeTrends(){
 if(primed)return;primed=true;
 const cohort=nodes.filter(n=>stateOf(reports[n.uuid])==='online');if(!cohort.length)return;
 const responses=await Promise.allSettled(cohort.map(n=>request('/api/recent/'+encodeURIComponent(n.uuid))));
 if(responses.some(r=>r.status!=='fulfilled'||!Array.isArray(r.value.data)))return;
 const seeded=recentAggregate(responses.map(r=>r.value.data),Date.now(),cohort);const first=samples[0]?.t??Date.now();samples=[...seeded.filter(s=>s.t<first),...samples];drawTrends();
}
async function loadNodes(){
 const j=await request('/api/nodes');if(!Array.isArray(j.data))throw new Error('节点列表格式异常');nodes=j.data;
 const current=$('group').value,groups=[...new Set(nodes.map(n=>n.group).filter(Boolean))];const html='<option value="">所有分组</option>'+groups.map(g=>`<option>${esc(g)}</option>`).join('');
 if($('group').innerHTML!==html){$('group').innerHTML=html;if(groups.includes(current))$('group').value=current;}
}
async function refresh(){
 if(busy||document.hidden)return;busy=true;$('refresh').disabled=true;
 try{const j=await request('/api/rpc2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'common:getNodesLatestStatus',id:1})});if(!j.result||typeof j.result!=='object'||Array.isArray(j.result))throw new Error('状态数据格式异常');
 const freshReport=Object.entries(j.result).some(([id,r])=>stateOf(r)==='online'&&Date.parse(r.time)>(Date.parse(reports[id]?.time)||0));reports=j.result;if(!selected&&location.pathname.startsWith('/instance/'))openDetail(decodeURIComponent(location.pathname.slice(10)));lastSuccess=Date.now();failed=false;$('error').hidden=true;$('detail-error').hidden=true;text('connection','实时同步');$('connection').className='connection live';latestAggregate=aggregate(nodes,reports);samples=samples.filter(s=>s.t>lastSuccess-300000);samples.push(latestAggregate);render();if(freshReport)beat();drawTrends();primeTrends().catch(()=>{});
 }catch(e){markError(e.message);render();}finally{busy=false;$('refresh').disabled=false;}
}
const fmt=v=>finite(v)?v.toLocaleString('zh-CN',{maximumFractionDigits:2}):'—';
function specification(pairs){return pairs.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v??'—')}</dd></div>`).join('');}
function updateDetail(){
 const n=nodes.find(n=>n.uuid===selected?.uuid)||selected;if(!n)return;const r=reports[n.uuid],state=lastSuccess?stateOf(r):'loading',live=state==='online';
 text('detail-status',labels[state]);$('detail-status').className='badge '+state;text('detail-subtitle',[regionName(regionCode(n.region)),n.os,n.arch].filter(Boolean).join(' · '));
 text('detail-freshness',`最近上报：${timeLabel(r?.time)}${live?'':' · 以下数值为最后一次上报'}`);
 const resources=[['CPU 使用率',finite(r?.cpu)?r.cpu.toFixed(1)+'%':'—',`${n.cpu_cores??'—'} 核处理器`,r?.cpu],['内存用量',bytes(r?.ram),`${bytes(r?.ram_total||n.mem_total)} 总量`,percent(r?.ram,r?.ram_total)],['磁盘用量',bytes(r?.disk),`${bytes(r?.disk_total||n.disk_total)} 总量`,percent(r?.disk,r?.disk_total)],['网络速率',finite(r?.net_out)?bytes(r.net_out)+'/s':'—',`↓ ${finite(r?.net_in)?bytes(r.net_in)+'/s':'—'}`,null]];
 $('detail-live').innerHTML=resources.map(([name,value,note,v])=>`<article data-usage="${usageLevel(v)}"><span>${name}</span><strong>${esc(value)}</strong><small>${esc(note)}</small>${finite(v)?`<div class="utilization">${v.toFixed(1)}% · ${v>=90?'高占用':v>=70?'偏高':'正常'}</div><div class="track"><span style="width:${Math.max(0,Math.min(v,100))}%"></span></div>`:''}</article>`).join('');
 $('detail-info').innerHTML=specification([['处理器',n.cpu_name||'未上报'],['核心 / 架构',`${n.cpu_cores??'—'} 核 / ${n.arch||'—'}`],['操作系统',n.os],['内核版本',n.kernel_version||'未上报'],['虚拟化',n.virtualization||'未上报'],['物理内存',bytes(n.mem_total)],['磁盘容量',bytes(n.disk_total)],['交换空间',`${bytes(r?.swap)} / ${bytes(n.swap_total)}`],['GPU',n.gpu_name&&n.gpu_name!=='None'?n.gpu_name:'未上报 GPU 信息']]);
 $('detail-runtime').innerHTML=specification([['运行时间',duration(r?.uptime)],['负载 · 1 / 5 / 15 分钟',[r?.load,r?.load5,r?.load15].map(fmt).join(' / ')],['进程数',fmt(r?.process)],['TCP / UDP 连接',`${fmt(r?.connections)} / ${fmt(r?.connections_udp)}`],['累计上传',bytes(r?.net_total_up)],['累计下载',bytes(r?.net_total_down)],['温度',finite(r?.temp)&&r.temp>0?r.temp.toFixed(1)+' °C':'未上报'],['所属分组',n.group||'未分组'],['标签',n.tags||'未设置']]);
 const extra=[];if(n.public_remark)extra.push(['公开备注',n.public_remark]);if(n.traffic_limit>0)extra.push(['流量配额',`${bytes(n.traffic_limit)} · ${n.traffic_limit_type||'未指定统计方式'}`]);if(n.price>0)extra.push(['费用',`${n.currency||''}${n.price} / ${n.billing_cycle||'—'} 天`]);if(n.expired_at)extra.push(['到期时间',timeLabel(n.expired_at)]);
 $('detail-extra').innerHTML=extra.length?'<h3>其他信息</h3><dl class="spec-list">'+specification(extra)+'</dl>':'';
}
const historyMetrics={
 cpu:{title:'CPU 使用率',series:[{key:'cpu',name:'CPU',color:'#0071e3'}],format:v=>v.toFixed(1)+'%',max:100},
 ram:{title:'内存用量',series:[{key:'ram',name:'内存',color:'#8b79cf'}],format:bytes},
 disk:{title:'磁盘用量',series:[{key:'disk',name:'磁盘',color:'#6684a8'}],format:bytes},
 swap:{title:'交换空间用量',series:[{key:'swap',name:'Swap',color:'#bd8540'}],format:bytes},
 network:{title:'上传与下载速率',series:[{key:'net_out',name:'上传',color:'#0071e3'},{key:'net_in',name:'下载',color:'#8b79cf'}],format:v=>bytes(v)+'/s'},
 load:{title:'系统负载',series:[{key:'load',name:'负载',color:'#0071e3'}],format:fmt},
 process:{title:'运行进程数',series:[{key:'process',name:'进程',color:'#22976b'}],format:v=>Math.round(v).toLocaleString()},
 connections:{title:'TCP / UDP 连接数',series:[{key:'connections',name:'TCP',color:'#0071e3'},{key:'connections_udp',name:'UDP',color:'#8b79cf'}],format:v=>Math.round(v).toLocaleString()}
};
function paintHistory(){
 const config=historyMetrics[$('history-metric').value];text('history-title',config.title);
 const end=Date.now(),start=end-Number($('history-hours').value)*3600000;
 const diffs=historyRows.slice(1).map((p,i)=>p.t-historyRows[i].t).filter(x=>x>0).sort((a,b)=>a-b),gap=Math.max(120000,(diffs[Math.floor(diffs.length/2)]||60000)*3);
 drawChart($('history'),historyRows,config.series,{start,end,max:config.max,gap,format:config.format,label:config.title,empty:'该节点在这个时间范围内没有上报记录。'});
 $('history-stats').innerHTML=config.series.map(s=>{const vals=historyRows.map(r=>r[s.key]).filter(v=>finite(v)&&v>=0);return `<div><span><i class="legend" style="background:${s.color}"></i>${s.name}</span><strong>${vals.length?esc(config.format(vals.reduce((a,b)=>a+b,0)/vals.length)):'—'}</strong><small>采样均值 · 峰值 ${vals.length?esc(config.format(Math.max(...vals))):'—'}</small></div>`;}).join('');
}
async function loadHistory(force=false){
 const signature=selected.uuid+':'+$('history-hours').value;
 if(signature===historySignature&&!force){paintHistory();return;}
 historyRequest?.abort();historyRequest=new AbortController();const signal=historyRequest.signal;historySignature='';historyRows=[];text('history','正在读取历史记录…');$('history-stats').replaceChildren();
 try{const j=await request(`/api/records/load?uuid=${encodeURIComponent(selected.uuid)}&hours=${$('history-hours').value}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});if(signal.aborted)return;
 if(!Array.isArray(j.data?.records))throw new Error('历史数据格式异常');historyRows=j.data.records.map(r=>({...r,t:Date.parse(r.time)})).filter(r=>finite(r.t)).sort((a,b)=>a.t-b.t);historySignature=signature;paintHistory();
 }catch(e){if(!signal.aborted)text('history','历史记录加载失败：'+e.message+' 点击刷新重试。');}
}
async function loadPing(force=false){
 const signature=selected.uuid+':'+$('ping-hours').value;if(pingLoaded===signature&&!force)return;
 pingRequest?.abort();pingRequest=new AbortController();const signal=pingRequest.signal;pingLoaded='';text('ping-results','正在读取网络探测记录…');
 try{const [result,taskResponse]=await Promise.all([request(`/api/records/ping?uuid=${encodeURIComponent(selected.uuid)}&hours=${$('ping-hours').value}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])}),tasks.length?Promise.resolve(null):request('/api/task/ping',{signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])})]);if(signal.aborted)return;
 if(taskResponse)tasks=Array.isArray(taskResponse.data)?taskResponse.data:[];const records=result.data?.records;if(!Array.isArray(records))throw new Error('网络记录格式异常');
 const ids=[...new Set([...tasks.filter(t=>t.clients?.includes(selected.uuid)).map(t=>t.id),...records.map(r=>r.task_id)])];
 if(!ids.length){text('ping-results','此节点尚未配置网络探测任务。');pingLoaded=signature;return;}
 $('ping-results').innerHTML=ids.map((id,index)=>{const rows=records.filter(r=>r.task_id===id),summary=pingSummary(rows),name=tasks.find(t=>t.id===id)?.name||`探测任务 ${id}`;return `<article class="ping-card"><div class="ping-head"><h3>${esc(name)}</h3><span>${summary.total} 次采样</span></div><div class="ping-metrics"><div><span>平均延迟</span><strong>${finite(summary.avg)?summary.avg.toFixed(1)+' ms':'—'}</strong></div><div><span>最低 / 最高</span><strong>${finite(summary.min)?summary.min+' / '+summary.max+' ms':'—'}</strong></div><div><span>丢包率</span><strong class="${summary.loss>0?'loss':''}">${finite(summary.loss)?summary.loss.toFixed(1)+'%':'—'}</strong></div></div><div id="ping-chart-${index}" class="plot"></div></article>`;}).join('');
 ids.forEach((id,index)=>{const rows=records.filter(r=>r.task_id===id).map(r=>({t:Date.parse(r.time),latency:r.value>=0?r.value:null}));const end=Date.now();drawChart($('ping-chart-'+index),rows,[{key:'latency',name:'延迟',color:'#0071e3'}],{start:end-Number($('ping-hours').value)*3600000,end,gap:180000,height:150,format:v=>v.toFixed(0)+'ms',label:'线路延迟',empty:rows.length?'该范围内的探测均未收到响应。':'没有网络探测数据。'});});
 pingLoaded=signature;
 }catch(e){if(!signal.aborted)text('ping-results','网络数据加载失败：'+e.message+' 点击刷新重试。');}
}
function openDetail(uuid){
 selected=nodes.find(n=>n.uuid===uuid);$('route-loading').hidden=true;
 if(!selected){$('route-error').hidden=false;return;}
 document.querySelector('.skip').href='#detail';document.querySelector('.skip').textContent='跳到服务器详情';text('detail-title',selected.name);document.title=selected.name+' · '+$('site-name').textContent;
 $('detail').hidden=false;updateDetail();loadHistory();loadPing();
}
$('cards').addEventListener('click',e=>{if(e.target.id==='clear'){filter='all';$('search').value='';$('group').value='';document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));render();}});
for(const b of document.querySelectorAll('[data-filter]'))b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render();};
$('search').oninput=render;$('group').onchange=render;$('sort').onchange=render;$('live-window').onchange=()=>{hideRanking();drawTrends();};
$('refresh').onclick=async()=>{try{await loadNodes();await refresh();}catch(e){markError(e.message);}};
$('history-metric').onchange=()=>loadHistory();$('history-hours').onchange=()=>loadHistory();$('history-retry').onclick=()=>loadHistory(true);$('ping-hours').onchange=()=>loadPing();$('ping-retry').onclick=()=>loadPing(true);
// Historical data refreshes separately; live values continue at the normal polling interval.
setInterval(()=>{if(document.hidden||!selected)return;loadHistory(true);loadPing(true);},60000);
document.addEventListener('keydown',e=>{if(e.key==='/'&&!selected&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)){e.preventDefault();$('search').focus();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
function clock(){updateHealth();const now=new Date();text('clock',now.toLocaleTimeString('zh-CN',{hour12:false}));text('date',now.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'}));text('updated',lastSuccess?`${failed?'上次成功同步':'最近更新'} · ${Math.max(0,Math.floor((Date.now()-lastSuccess)/1000))} 秒前`:'尚未更新');}
async function init(){try{const [settings]=await Promise.all([request('/api/public'),loadNodes()]);const info=settings.data||{},s=info.theme_settings||{};text('site-name',info.sitename||'我的监测站');document.title=info.sitename||'晴空监测';text('headline',s.headline||'服务器状态');text('subtitle',s.subtitle||info.description||'实时查看节点资源与网络状态。');if(location.pathname.startsWith('/instance/'))openDetail(decodeURIComponent(location.pathname.slice(10)));await refresh();}catch(e){markError(e.message);if(location.pathname.startsWith('/instance/'))text('route-loading','加载失败，请刷新页面重试。');$('cards').innerHTML='<div class="empty">暂时无法读取节点，请稍后重试或进入控制台登录。</div>';$('cards').setAttribute('aria-busy','false');}request('/api/version').then(j=>text('version',j.data?.version||'1.5+')).catch(()=>{});}
createGlobe($('globe'),$('region-list'),$('globe-motion')).then(g=>{globe=g;globe.update(nodes,reports);updateHealth();}).catch(()=>{text('region-list','地图资源加载失败，请刷新页面重试。');$('globe-motion').disabled=true;});
clock();setInterval(clock,1000);init();setInterval(()=>{if(!nodes.length){if(!document.hidden)loadNodes().then(refresh).catch(e=>markError(e.message));}else refresh();},5000);setInterval(()=>{if(!document.hidden)loadNodes().then(render).catch(()=>{});},60000);

function syncAppearanceButtons(){document.querySelectorAll('[data-appearance-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.appearanceMode===window.aeroAppearance.mode)));}document.querySelectorAll('[data-appearance-mode]').forEach(b=>b.onclick=()=>{window.aeroAppearance.set(b.dataset.appearanceMode);syncAppearanceButtons();});syncAppearanceButtons();$('site-avatar').onerror=()=>{$('site-avatar').hidden=true;};
