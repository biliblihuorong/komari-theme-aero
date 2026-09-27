import assert from 'node:assert/strict';
import {createGlobe} from './dist/assets/globe.js';
const saved=new Map(),replace=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});};
let clock=0,queued=null,heads=[];
const noop=()=>{},context=new Proxy({createRadialGradient:()=>({addColorStop:noop}),arc:(x,y,r)=>{if(r===4)heads.push({x,y});}},{get:(o,k)=>o[k]??noop});
const media={matches:true,addEventListener:noop};
const element=()=>({dataset:{},setAttribute:noop,querySelectorAll:()=>[],getBoundingClientRect:()=>({width:400,height:300})});
try{
 replace('fetch',async()=>({json:async()=>({land:[],centers:{HK:[114,22],JP:[138,36]}})}));
 replace('matchMedia',()=>media);replace('document',{hidden:false,documentElement:{dataset:{}},addEventListener:noop});replace('window',{addEventListener:noop});
 replace('performance',{now:()=>clock});replace('devicePixelRatio',1);replace('requestAnimationFrame',fn=>{queued=fn;return 1;});replace('ResizeObserver',class{observe(){}});replace('IntersectionObserver',class{observe(){}});
 const canvas={...element(),getContext:()=>context},rotation=element(),list=element();
 const globe=await createGlobe(canvas,list,rotation);
 const nodes=[{uuid:'a',region:'HK'},{uuid:'b',region:'JP'}],report={online:true,time:new Date().toISOString()};
 globe.update(nodes,{a:report,b:report});
 const step=time=>{clock=time;const fn=queued;queued=null;heads=[];fn?.(time);return heads.at(-1);};
 step(0);assert.equal(rotation.textContent,'开始旋转');assert.ok(queued);assert.deepEqual(globe.regionCodes,['HK','JP']);
 const first=step(100);const next=step(1000);
 assert.ok(first&&next,'Packet must animate automatically with rotation paused');assert.notDeepEqual(first,next,'Packet must move');assert.equal(rotation.textContent,'开始旋转');
 assert.equal(step(2500),undefined,'Finished packet must disappear');
 step(3000);assert.ok(queued,'Packets must continue automatically');document.hidden=true;step(3100);assert.equal(queued,null,'Hidden tabs must suspend frame scheduling');
 console.log('PASS: globe packet moves while rotation is stopped; automatic transmission, disappearance and background suspension work');
}finally{for(const [key,descriptor]of saved)descriptor?Object.defineProperty(globalThis,key,descriptor):delete globalThis[key];}
