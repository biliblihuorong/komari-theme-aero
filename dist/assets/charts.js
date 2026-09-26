import {finite,escapeHTML as esc} from './data.js';

// A single renderer for live and historical charts. Gaps remain gaps.
export function chartGeometry(rows, series, {start,end,max,gap=Infinity,width=600,height=180}={}) {
  const points=rows.filter(r=>finite(r.t)).toSorted((a,b)=>a.t-b.t);
  start ??= points[0]?.t ?? 0; end ??= points.at(-1)?.t ?? start+1;
  const values=points.flatMap(r=>series.map(s=>r[s.key])).filter(v=>finite(v)&&v>=0);
  const ceiling=max??Math.max(1,...values)*1.15;
  return {start,end,max:ceiling,width,height,points,paths:series.map(s=>{
    let previous=null;
    return points.map(r=>{const v=r[s.key];if(!finite(v)||v<0){previous=null;return '';}
      const x=72+(r.t-start)/Math.max(1,end-start)*(width-88),y=16+(1-Math.min(v,ceiling)/ceiling)*(height-44);
      const command=!previous||r.t-previous.t>gap?'M':'L';previous=r;return `${command}${x.toFixed(2)},${y.toFixed(2)}`;
    }).filter(Boolean).join(' ');
  })};
}
export function drawChart(el, rows, series, options={}) {
  const g=chartGeometry(rows,series,{...options,width:Math.max(260,el.clientWidth||600)}), format=options.format||((v)=>v.toFixed(1)), mini=options.mini;
  const usable=g.points.some(r=>series.some(s=>finite(r[s.key])&&r[s.key]>=0));
  if(!usable){el.innerHTML='<div class="chart-empty">'+esc(options.empty||'暂无可用采样数据')+'</div>';el.onpointermove=null;el.onpointerdown=null;el.onpointerleave=null;el.onkeydown=null;return;}
  const ticks=[0,.5,1];
  el.innerHTML=`<svg viewBox="0 0 ${g.width} ${g.height}" role="img" aria-label="${esc(options.label||'监控趋势')}，${g.points.length} 个采样点"><defs><linearGradient id="fill-${el.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${series[0].color}" stop-opacity=".12"/><stop offset="1" stop-color="${series[0].color}" stop-opacity="0"/></linearGradient></defs>${ticks.map(v=>{const y=16+v*(g.height-44);return `<path class="chart-grid" d="M72 ${y}H${g.width-16}" stroke="#e6edf5" stroke-dasharray="3 5"/>${mini?'':`<text class="chart-axis" x="2" y="${y+4}" fill="#63738a" font-size="13">${esc(format(g.max*(1-v)))}</text>`}`;}).join('')}${g.paths.map((d,i)=>`<path class="chart-line" d="${d}" fill="none" stroke="${series[i].color}" stroke-width="${mini?2.3:2.5}" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}${g.points.length===1?series.map(s=>finite(g.points[0][s.key])?`<circle cx="${72+(g.points[0].t-g.start)/Math.max(1,g.end-g.start)*(g.width-88)}" cy="${16+(1-Math.min(g.points[0][s.key],g.max)/g.max)*(g.height-44)}" r="3" fill="${s.color}"/>`:'').join(''):''}<line class="chart-cursor" x1="0" x2="0" y1="14" y2="${g.height-25}" stroke="#849bb8" stroke-dasharray="3 3" visibility="hidden"/></svg>${mini?'':`<div class="chart-labels"><span>${esc(new Date(g.start).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:options.seconds?'2-digit':undefined}))}</span><span>${esc(options.note||g.points.length+' 个采样点')}</span><span>${esc(new Date(g.end).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',second:options.seconds?'2-digit':undefined}))}</span></div><div class="chart-tooltip" hidden></div>`}`;
  if(mini)return;
  el.tabIndex=0;el.setAttribute('aria-label',(options.label||'监控趋势')+'。使用左右方向键查看采样值。');
  let index=g.points.length-1,pointer=null;
  const show=i=>{index=Math.max(0,Math.min(g.points.length-1,i));const row=g.points[index],tip=el.querySelector('.chart-tooltip'),cursor=el.querySelector('.chart-cursor'),x=72+(row.t-g.start)/Math.max(1,g.end-g.start)*(g.width-88);cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);cursor.setAttribute('visibility','visible');tip.hidden=!!options.externalTooltip;tip.style.left=`${Math.max(3,Math.min(65,x/g.width*100))}%`;tip.innerHTML=`<b>${new Date(row.t).toLocaleTimeString('zh-CN',{hour12:false})}</b>`+series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.name)} <strong>${finite(row[s.key])&&row[s.key]>=0?esc(format(row[s.key])):'缺失'}</strong></span>`).join('');options.onInspect?.(row,pointer);};
  el.onpointermove=e=>{pointer={x:e.clientX,y:e.clientY,type:e.pointerType||'mouse',pin:e.type==='pointerdown'};const box=el.querySelector('svg').getBoundingClientRect(),t=g.start+((e.clientX-box.left)/box.width*g.width-72)/(g.width-88)*(g.end-g.start);show(g.points.reduce((best,r,i)=>Math.abs(r.t-t)<Math.abs(g.points[best].t-t)?i:best,0));};
  el.onpointerdown=el.onpointermove;
  el.onpointerleave=()=>{el.querySelector('.chart-tooltip').hidden=true;el.querySelector('.chart-cursor').setAttribute('visibility','hidden');options.onInspectEnd?.();};
  el.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();pointer={type:'keyboard',pin:true};show(index+(e.key==='ArrowLeft'?-1:1));}};
}
