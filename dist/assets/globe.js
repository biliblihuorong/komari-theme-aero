import {escapeHTML as esc,stateOf,regionCode,regionName,projectGlobe} from './data.js';
export async function createGlobe(canvas,list,button) {
  const geo=await (await fetch(new URL('./earth.json',import.meta.url))).json(),ctx=canvas.getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let longitude=110,latitude=20,running=!reduced.matches,drag=null,last=0,visible=true,regions=[],frame=0,drawn=[];
  const showButton=()=>{button.textContent=running?'暂停旋转':'开始旋转';button.setAttribute('aria-pressed',String(running));};
  function project(lon,lat,cx,cy,r){const p=projectGlobe(lon,lat,longitude,latitude);return {x:cx+p.x*r,y:cy-p.y*r,z:p.z};}
  function draw(time=performance.now()) {
    const size=canvas.getBoundingClientRect(),w=size.width,h=size.height;if(!w||!h)return;
    const dpr=Math.min(devicePixelRatio||1,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    const dark=document.documentElement.dataset.appearance==='dark';const cx=w*.5,cy=h*.5,r=Math.min(w*.43,h*.46);
    const glow=ctx.createRadialGradient(cx-r*.35,cy-r*.45,r*.05,cx,cy,r*1.13);glow.addColorStop(0,dark?'#244967':'#fcfeff');glow.addColorStop(.8,dark?'#142d46':'#e7f1fd');glow.addColorStop(1,dark?'#24415c':'#d2e5fa');
    ctx.shadowColor='#458bcc1a';ctx.shadowBlur=28;ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    ctx.strokeStyle=dark?'#789abd40':'#c6dbee70';ctx.lineWidth=.6;
    for(let lat=-60;lat<=60;lat+=30){ctx.beginPath();let pen=false;for(let lon=-180;lon<=180;lon+=3){const p=project(lon,lat,cx,cy,r);if(p.z>0){pen?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);pen=true;}else pen=false;}ctx.stroke();}
    for(let lon=-180;lon<180;lon+=30){ctx.beginPath();let pen=false;for(let lat=-90;lat<=90;lat+=3){const p=project(lon,lat,cx,cy,r);if(p.z>0){pen?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);pen=true;}else pen=false;}ctx.stroke();}
    for(const [lon,lat]of geo.land){const p=project(lon,lat,cx,cy,r);if(p.z<=0)continue;ctx.fillStyle=`rgba(103,148,192,${.22+p.z*.5})`;ctx.beginPath();ctx.arc(p.x,p.y,.7+p.z*.6,0,Math.PI*2);ctx.fill();}
    drawn=[];
    for(const region of regions){const coords=geo.centers[region.code];if(!coords)continue;const p=project(...coords,cx,cy,r);if(p.z<=.02)continue;drawn.push({...p,region});const color=region.online?'#0071e3':'#9c7883';
      if(region.online&&!reduced.matches){const pulse=(time%2200)/2200;ctx.strokeStyle=`rgba(0,113,227,${(1-pulse)*.4})`;ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(p.x,p.y,5+pulse*13,0,Math.PI*2);ctx.stroke();}
      ctx.fillStyle=color;ctx.shadowColor=color;ctx.shadowBlur=region.online?11:0;ctx.beginPath();ctx.arc(p.x,p.y,region.online?4.5:3,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
      ctx.font='11px system-ui';ctx.fillStyle=dark?'#b9d7f6':'#3c5879';ctx.fillText(region.code,p.x+8,p.y-7);
    }
  }
  function tick(time){frame=0;if(!visible||document.hidden)return;if(running&&!drag){longitude+=(last?Math.min(time-last,100):0)*.003;}last=time;draw(time);if(running||(!reduced.matches&&regions.some(r=>r.online)))frame=requestAnimationFrame(tick);}
  const wake=()=>{if(!frame){last=0;frame=requestAnimationFrame(tick);}};
  const focus=code=>{const p=geo.centers[code];if(p){[longitude,latitude]=p;running=false;showButton();draw();wake();}list.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.region===code)));};
  button.onclick=()=>{running=!running;showButton();wake();};
  canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>2)drag.moved=true;longitude-=dx*.35;latitude=Math.max(-65,Math.min(65,latitude+dy*.25));drag.x=e.clientX;drag.y=e.clientY;running=false;showButton();draw();}else{const b=canvas.getBoundingClientRect(),hit=drawn.find(p=>Math.hypot(p.x-e.clientX+b.left,p.y-e.clientY+b.top)<16);canvas.title=hit?`${regionName(hit.region.code)} · ${hit.region.online}/${hit.region.total} 在线`:'拖动地球旋转 · 点击地区定位';}};
  canvas.onpointerup=e=>{if(drag&&!drag.moved){const b=canvas.getBoundingClientRect(),hit=drawn.find(p=>Math.hypot(p.x-e.clientX+b.left,p.y-e.clientY+b.top)<16);if(hit)focus(hit.region.code);}drag=null;};canvas.onpointercancel=()=>drag=null;
  canvas.onkeydown=e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();longitude+=e.key==='ArrowLeft'?-10:e.key==='ArrowRight'?10:0;latitude=Math.max(-65,Math.min(65,latitude+(e.key==='ArrowUp'?10:e.key==='ArrowDown'?-10:0)));running=false;showButton();draw();}};
  list.onclick=e=>{const b=e.target.closest('[data-region]');if(b)focus(b.dataset.region);};
  window.addEventListener('aero-appearance-change',()=>draw());new ResizeObserver(()=>draw()).observe(canvas);new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)wake();}).observe(canvas);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)wake();});reduced.addEventListener('change',()=>{if(reduced.matches)running=false;showButton();wake();});showButton();wake();
  return {update(nodes,reports){const map=new Map();for(const n of nodes){const code=regionCode(n.region);if(!code)continue;const item=map.get(code)||{code,total:0,online:0};item.total++;if(stateOf(reports[n.uuid])==='online')item.online++;map.set(code,item);}regions=[...map.values()].sort((a,b)=>b.online-a.online);const html=regions.map(r=>`<button data-region="${esc(r.code)}" aria-pressed="false" ${geo.centers[r.code]?'':'disabled'}><span class="region-led ${r.online?'lit':''}"></span><span>${esc(regionName(r.code))}</span><strong>${r.online}<small> / ${r.total}</small></strong></button>`).join('');if(list.dataset.signature!==html){list.dataset.signature=html;list.innerHTML=html||'<p>暂无可定位的地区信息</p>';}canvas.setAttribute('aria-label',`节点地区示意地球，${regions.length} 个地区。左右方向键旋转，上下方向键调整角度。`);draw();wake();}};
}
