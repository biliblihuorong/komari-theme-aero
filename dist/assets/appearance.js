// Runs before styles to avoid a light flash when the system is in dark mode.
(()=>{
 document.documentElement.dataset.page=location.pathname.startsWith('/instance/')?'instance':'overview';
 const system=matchMedia('(prefers-color-scheme: dark)');
 let mode='auto';try{const saved=localStorage.getItem('aero-appearance');if(['auto','light','dark'].includes(saved))mode=saved;}catch{}
 function apply(){const dark=mode==='dark'||(mode==='auto'&&system.matches);document.documentElement.dataset.appearance=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#101722':'#f5f7fa');window.dispatchEvent(new Event('aero-appearance-change'));}
 window.aeroAppearance={get mode(){return mode;},set(value){if(!['auto','light','dark'].includes(value))return;mode=value;try{localStorage.setItem('aero-appearance',mode);}catch{}apply();}};
 system.addEventListener('change',()=>{if(mode==='auto')apply();});apply();
})();
