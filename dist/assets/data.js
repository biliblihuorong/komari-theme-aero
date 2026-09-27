export const finite = value => typeof value === 'number' && Number.isFinite(value);
export const percent = (used,total) => finite(used) && finite(total) && total>0 ? Math.max(0,Math.min(100,used/total*100)) : null;
export function bytes(value){if(!finite(value)||value<0)return '—';const units=['B','KB','MB','GB','TB','PB'];const i=value===0?0:Math.max(0,Math.min(Math.floor(Math.log(value)/Math.log(1024)),units.length-1));return `${(value/1024**i).toFixed(i===0?0:value/1024**i>=100?0:1)} ${units[i]}`;}
export function stateOf(report,now=Date.now()) {if(!report||report.online!==true)return 'offline';const age=now-Date.parse(report.time);return !Number.isFinite(age)||age>30000||age< -30000?'stale':'online';}
export function selectNodes(nodes,reports,{filter='all',group='',search='',sort='default'}={},now=Date.now()) {const query=search.trim().toLocaleLowerCase();return nodes.filter(n=>(!group||n.group===group)&&(!query||[n.name,n.region,n.os,n.group].some(v=>String(v||'').toLocaleLowerCase().includes(query)))&&(filter==='all'||(filter==='online'?stateOf(reports[n.uuid],now)==='online':stateOf(reports[n.uuid],now)!=='online'))).sort((a,b)=>sort==='name'?String(a.name).localeCompare(String(b.name),'zh-CN'):sort==='cpu'?((stateOf(reports[b.uuid],now)==='online'?reports[b.uuid]?.cpu:-1)??-1)-((stateOf(reports[a.uuid],now)==='online'?reports[a.uuid]?.cpu:-1)??-1):(Number(a.weight)||0)-(Number(b.weight)||0));}
export function duration(seconds){if(!finite(seconds)||seconds<0)return '—';return seconds>=86400?`${Math.floor(seconds/86400)} 天`:seconds>=3600?`${Math.floor(seconds/3600)} 小时`:`${Math.floor(seconds/60)} 分钟`;}
export const escapeHTML = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function regionCode(value){const s=String(value||'').trim();const chars=[...s];if(chars.length===2&&chars.every(c=>c.codePointAt(0)>=0x1f1e6&&c.codePointAt(0)<=0x1f1ff))return chars.map(c=>String.fromCharCode(c.codePointAt(0)-0x1f1e6+65)).join('');if(/^[A-Za-z]{2}$/.test(s))return s.toUpperCase()==='UK'?'GB':s.toUpperCase();return null;}
const regionNames=new Intl.DisplayNames(['zh-CN'],{type:'region'});
export function regionName(code){try{return regionNames.of(code)||code;}catch{return code||'未知地区';}}
export function projectGlobe(lon,lat,centerLon=110,centerLat=20){const r=Math.PI/180,l=(lon-centerLon)*r,p=lat*r,c=centerLat*r;return {x:Math.cos(p)*Math.sin(l),y:Math.cos(c)*Math.sin(p)-Math.sin(c)*Math.cos(p)*Math.cos(l),z:Math.sin(c)*Math.sin(p)+Math.cos(c)*Math.cos(p)*Math.cos(l)};}
export function aggregate(nodes,reports,now=Date.now()){
 const rows=nodes.map(n=>reports[n.uuid]).filter(r=>stateOf(r,now)==='online');
 const avg=key=>{const values=rows.map(r=>r[key]).filter(finite);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;};
 const sum=key=>{const values=rows.map(r=>r[key]).filter(finite);return values.length?values.reduce((a,b)=>a+b,0):null;};
 return {t:now,contributors:nodes.filter(n=>stateOf(reports[n.uuid],now)==='online').map(n=>({uuid:n.uuid,name:n.name,up:reports[n.uuid].net_out,down:reports[n.uuid].net_in,time:reports[n.uuid].time})),ramUsed:sum('ram'),ramTotal:sum('ram_total'),online:rows.length,cpu:avg('cpu'),up:sum('net_out'),down:sum('net_in'),ram:percent(sum('ram'),sum('ram_total')),regions:new Set(nodes.filter(n=>stateOf(reports[n.uuid],now)==='online').map(n=>regionCode(n.region)).filter(Boolean)).size};
}
// Only aggregate buckets with a fresh reading from every member of the current online cohort.
export function recentAggregate(cohort,now=Date.now(),identities=[]){
 if(!cohort.length)return [];
 const series=cohort.map(records=>records.map(r=>({...r,t:Date.parse(r.updated_at)})).filter(r=>finite(r.t)).sort((a,b)=>a.t-b.t));const result=[];
 for(let t=Math.floor((now-300000)/5000)*5000;t<=now;t+=5000){const rows=series.map(records=>records.findLast(r=>r.t<=t&&t-r.t<=8000));if(rows.some(r=>!r))continue;
 const valid=rows.every(r=>finite(r.network?.up)&&finite(r.network?.down)&&finite(r.cpu?.usage));if(!valid)continue;
 result.push({t,contributors:rows.map((r,i)=>({uuid:identities[i]?.uuid||r.uuid,name:identities[i]?.name||r.uuid||'未知节点',up:r.network.up,down:r.network.down,time:r.updated_at})),up:rows.reduce((s,r)=>s+r.network.up,0),down:rows.reduce((s,r)=>s+r.network.down,0),cpu:rows.reduce((s,r)=>s+r.cpu.usage,0)/rows.length,ram:percent(rows.reduce((s,r)=>s+(r.ram?.used||0),0),rows.reduce((s,r)=>s+(r.ram?.total||0),0)),online:null});
 }return result;
}
export function pingSummary(records){const valid=records.filter(r=>finite(r.value));const success=valid.filter(r=>r.value>=0);return {total:valid.length,loss:valid.length?(valid.length-success.length)/valid.length*100:null,avg:success.length?success.reduce((s,r)=>s+r.value,0)/success.length:null,min:success.length?Math.min(...success.map(r=>r.value)):null,max:success.length?Math.max(...success.map(r=>r.value)):null};}

export function rankTraffic(sample,direction,limit=5){if(!['up','down'].includes(direction))return [];return (sample?.contributors||[]).filter(r=>finite(r[direction])&&r[direction]>=0).toSorted((a,b)=>b[direction]-a[direction]||String(a.name).localeCompare(String(b.name))).slice(0,limit);}

export function fleetHealth(nodes,reports,{lastSuccess=0,failed=false,now=Date.now()}={}){
 const online=nodes.filter(n=>stateOf(reports[n.uuid],now)==='online').length;
 const stale=nodes.filter(n=>stateOf(reports[n.uuid],now)==='stale').length;
 const offline=nodes.length-online-stale;
 if(failed||lastSuccess&&now-lastSuccess>30000)return {state:'disconnected',title:'数据中断',note:'状态暂不可确认，请检查连接',online,offline,stale,color:'#77889f'};
 if(!lastSuccess)return {state:'loading',title:'等待数据',note:'正在获取节点状态',online,offline,stale,color:'#77889f'};
 if(!nodes.length)return {state:'empty',title:'暂无节点',note:'尚未添加监控节点',online,offline,stale,color:'#77889f'};
 if(stale)return {state:'stale',title:'存在过期数据',note:`${online} 在线 · ${offline} 离线 · ${stale} 数据过期`,online,offline,stale,color:'#bd781d'};
 if(!online)return {state:'offline',title:'全部离线',note:`${offline} 个节点均未在线`,online,offline,stale,color:'#d35464'};
 if(offline)return {state:'degraded',title:'部分离线',note:`${online} 在线 · ${offline} 离线`,online,offline,stale,color:'#bd781d'};
 return {state:'healthy',title:'全部在线',note:`${online} 个节点正常上报`,online,offline,stale,color:'#22976b'};
}

export function placePopover(anchor,size,viewport){const pad=12;let left=anchor.right+pad;if(left+size.width>viewport.width-pad)left=anchor.left-size.width-pad;left=Math.max(pad,Math.min(left,viewport.width-size.width-pad));const top=Math.max(pad,Math.min(anchor.top,viewport.height-size.height-pad));return {left,top};}

export function usageLevel(value){return !finite(value)||value<0?'unknown':value>=90?'critical':value>=70?'warn':'ok';}


export function curvePoint(a,b,c,t){const u=1-t;return {x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y};}

export function packetPhase(elapsed){return {progress:Math.max(0,Math.min(1,elapsed/1800)),opacity:Math.max(0,Math.min(1,(2300-elapsed)/500)),done:elapsed>=2300};}

export function regionCoverage(nodes,mapCodes){const covered=new Set(nodes.map(n=>regionCode(n.region)).filter(Boolean)),all=new Set([...mapCodes,...covered]);return {total:all.size,lit:covered.size,unlit:all.size-covered.size};}
