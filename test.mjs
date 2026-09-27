import assert from 'node:assert/strict';
import {bytes,percent,stateOf,selectNodes,escapeHTML} from './dist/assets/data.js';
assert.equal(bytes(0),'0 B');assert.equal(bytes(0.5),'1 B');assert.equal(bytes(1024),'1.0 KB');assert.equal(bytes(undefined),'—');assert.equal(percent(2,0),null);assert.equal(percent(3,2),100);
const now=Date.parse('2026-09-25T12:00:00Z');const live={online:true,time:'2026-09-25T11:59:58Z',cpu:20};assert.equal(stateOf(live,now),'online');assert.equal(stateOf({...live,time:'invalid'},now),'stale');assert.equal(stateOf(live,now+60000),'stale');assert.equal(stateOf({...live,online:false},now),'offline');assert.equal(stateOf(null,now),'offline');
const nodes=[{uuid:'a',name:'东京',group:'JP'},{uuid:'b',name:'香港',group:'HK'}];assert.equal(selectNodes(nodes,{a:live},{filter:'offline'},now)[0].uuid,'b');assert.equal(selectNodes(nodes,{a:live},{group:'JP',search:'东京'},now).length,1);assert.equal(selectNodes(nodes,{a:live},{search:'无结果'},now).length,0);assert.equal(escapeHTML('<img src=x onerror="x">'),'&lt;img src=x onerror=&quot;x&quot;&gt;');
console.log('PASS: formatting, missing data, stale/offline states, filtering, and HTML escaping');
import {aggregate,recentAggregate,pingSummary,regionCode,projectGlobe} from './dist/assets/data.js';
import {chartGeometry} from './dist/assets/charts.js';
assert.equal(regionCode('🇭🇰'),'HK');assert.equal(regionCode('jp'),'JP');assert.equal(regionCode('未知'),null);
const center=projectGlobe(110,20,110,20);assert.ok(Math.abs(center.x)<1e-9&&Math.abs(center.y)<1e-9&&Math.abs(center.z-1)<1e-9);assert.ok(projectGlobe(-70,-20,110,20).z<0);
assert.equal(aggregate(nodes,{a:{...live,net_in:100,net_out:50,ram:10,ram_total:20}},now).down,100);
const pings=pingSummary([{value:20},{value:-1},{value:40}]);assert.equal(pings.avg,30);assert.ok(Math.abs(pings.loss-100/3)<1e-9);assert.equal(pingSummary([]).loss,null);
const cohort=[[{updated_at:'2026-09-25T11:59:55Z',cpu:{usage:10},network:{up:10,down:20},ram:{used:1,total:2}}],[{updated_at:'2026-09-25T11:59:55Z',cpu:{usage:30},network:{up:30,down:40},ram:{used:1,total:2}}]];
assert.equal(recentAggregate(cohort,now).at(-1).up,40);assert.equal(recentAggregate(cohort,now).at(-1).cpu,20);assert.equal(recentAggregate([...cohort,[]],now).length,0);
const geo=chartGeometry([{t:0,x:10},{t:1000,x:null},{t:2000,x:20},{t:10000,x:30}],[{key:'x'}],{gap:3000});assert.equal((geo.paths[0].match(/M/g)||[]).length,3);assert.ok(!geo.paths[0].includes('NaN'));
console.log('PASS: globe projection, region parsing, complete-cohort aggregation, packet loss, and chart gaps');

import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const systemAppearance={matches:false,addEventListener(_,handler){this.listener=handler;}};
const rootElement={dataset:{},style:{}};let savedAppearance=null;
const appearanceContext={location:{pathname:'/'},matchMedia:()=>systemAppearance,document:{documentElement:rootElement,querySelector:()=>({setAttribute(){}})},localStorage:{getItem:()=>savedAppearance,setItem:(_,value)=>savedAppearance=value},window:{dispatchEvent(){}},Event};
runInNewContext(readFileSync(new URL('./dist/assets/appearance.js',import.meta.url),'utf8'),appearanceContext);
assert.equal(rootElement.dataset.appearance,'light');systemAppearance.matches=true;systemAppearance.listener();assert.equal(rootElement.dataset.appearance,'dark');appearanceContext.window.aeroAppearance.set('light');systemAppearance.listener();assert.equal(rootElement.dataset.appearance,'light');appearanceContext.window.aeroAppearance.set('auto');assert.equal(rootElement.dataset.appearance,'dark');assert.equal(savedAppearance,'auto');
systemAppearance.matches=false;systemAppearance.listener();assert.equal(rootElement.dataset.appearance,'light');
appearanceContext.window.aeroAppearance.set('dark');systemAppearance.listener();assert.equal(rootElement.dataset.appearance,'dark');
runInNewContext(readFileSync(new URL('./dist/assets/appearance.js',import.meta.url),'utf8'),appearanceContext);assert.equal(rootElement.dataset.appearance,'dark');assert.equal(appearanceContext.window.aeroAppearance.mode,'dark');
appearanceContext.window.aeroAppearance.set('auto');assert.equal(rootElement.dataset.appearance,'light');
systemAppearance.matches=true;systemAppearance.listener();assert.equal(rootElement.dataset.appearance,'dark');
runInNewContext(readFileSync(new URL('./dist/assets/appearance.js',import.meta.url),'utf8'),appearanceContext);assert.equal(appearanceContext.window.aeroAppearance.mode,'auto');assert.equal(rootElement.dataset.appearance,'dark');
console.log('PASS: automatic system appearance, manual override, and preference persistence');

import {rankTraffic} from './dist/assets/data.js';
const snapshot=aggregate([{uuid:'a',name:'A'},{uuid:'b',name:'B'}],{a:{...live,net_out:20,net_in:90},b:{...live,net_out:80,net_in:10}},now);
assert.equal(rankTraffic(snapshot,'up')[0].name,'B');assert.equal(rankTraffic(snapshot,'down')[0].name,'A');assert.equal(rankTraffic(snapshot,'up',1).length,1);assert.deepEqual(rankTraffic(snapshot,'bad'),[]);
const sources={a:{...live,net_out:12,net_in:24}};const frozen=aggregate([{uuid:'a',name:'A'}],sources,now);sources.a.net_out=999;assert.equal(rankTraffic(frozen,'up')[0].up,12);
const seeded=recentAggregate(cohort,now,[{uuid:'a',name:'A'},{uuid:'b',name:'B'}]).at(-1);assert.equal(rankTraffic(seeded,'up')[0].name,'B');assert.equal(seeded.contributors.reduce((s,r)=>s+r.up,0),seeded.up);
console.log('PASS: directional ranks, snapshot consistency, and historical contributor totals');

import {fleetHealth} from './dist/assets/data.js';
const healthNodes=[{uuid:'a'},{uuid:'b'}];const options={lastSuccess:now,now};
assert.equal(fleetHealth(healthNodes,{a:live,b:live},options).state,'healthy');
assert.equal(fleetHealth(healthNodes,{a:live},options).state,'degraded');
assert.equal(fleetHealth(healthNodes,{},options).state,'offline');
assert.equal(fleetHealth(healthNodes,{a:{...live,time:'2026-09-25T11:58:00Z'},b:live},options).state,'stale');
assert.equal(fleetHealth(healthNodes,{a:live,b:live},{...options,failed:true}).state,'disconnected');
assert.equal(fleetHealth(healthNodes,{a:live},{lastSuccess:now-31000,now}).state,'disconnected');
assert.equal(fleetHealth(healthNodes,{},{now}).state,'loading');assert.equal(fleetHealth([],{},options).state,'empty');
console.log('PASS: all-online, partially offline, all-offline, stale, failed, waiting, and empty fleet health');

import {usageLevel,placePopover} from './dist/assets/data.js';
assert.equal(usageLevel(69.9),'ok');assert.equal(usageLevel(70),'warn');assert.equal(usageLevel(89.9),'warn');assert.equal(usageLevel(90),'critical');assert.equal(usageLevel(null),'unknown');
for(const a of [{left:10,right:100,top:20},{left:800,right:900,top:780}]){const p=placePopover(a,{width:400,height:500},{width:1000,height:800});assert.ok(p.left>=12&&p.left+400<=988&&p.top>=12&&p.top+500<=788);}
console.log('PASS: utilization severity boundaries and viewport-clamped popovers');

import {drawChart} from './dist/assets/charts.js';
const events=[],tooltip={style:{}},cursor={setAttribute(){}};
const chartElement={clientWidth:500,setAttribute(){},querySelector(selector){return selector==='svg'?{getBoundingClientRect:()=>({left:0,width:500})}:selector==='.chart-tooltip'?tooltip:cursor;}};
drawChart(chartElement,[{t:0,up:1},{t:5000,up:2}],[{key:'up',name:'上传',color:'#0071e3'}],{externalTooltip:true,onInspect:(row,pointer)=>events.push(pointer)});
chartElement.onpointermove({clientX:200,clientY:120,pointerType:'mouse',type:'pointermove'});assert.equal(events.at(-1).pin,false);
chartElement.onpointerdown({clientX:200,clientY:120,pointerType:'mouse',type:'pointerdown'});assert.equal(events.at(-1).pin,true);
chartElement.onpointerdown({clientX:200,clientY:120,pointerType:'touch',type:'pointerdown'});assert.equal(events.at(-1).pin,true);
chartElement.onkeydown({key:'ArrowLeft',preventDefault(){}});assert.equal(events.at(-1).pin,true);
console.log('PASS: hovering previews, clicking/touching/keyboard inspection pins');
