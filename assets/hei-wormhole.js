/* HEI Shipyards procedural archive jump: no external libraries or assets. */
(function(){
'use strict';
const overlay=document.getElementById('warp'),canvas=document.getElementById('wormhole-canvas');
if(!overlay||!canvas)return;
if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){overlay.remove();return;}
const ctx=canvas.getContext('2d',{alpha:false});
if(!ctx)return;
let w=0,h=0,cx=0,cy=0,unit=0,dpr=1,stars=[],frame=0,start=null,disposed=false;
const duration=3900,tau=Math.PI*2;
function resize(){
 dpr=Math.min(window.devicePixelRatio||1,1.5);
 w=window.innerWidth;h=window.innerHeight;
 canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 ctx.setTransform(dpr,0,0,dpr,0,0);
 cx=w/2;cy=h/2;unit=Math.max(w,h)*.43;
 stars=Array.from({length:w<700?210:510},function(){
  const a=Math.random()*tau,r=.18+Math.sqrt(Math.random())*1.2;
  return {x:Math.cos(a)*r,y:Math.sin(a)*r,z:Math.random(),speed:.65+Math.random()*.7,tint:Math.random()};
 });
}
function draw(now){
 if(disposed)return;
 if(start===null)start=now;
 const t=Math.min(1,(now-start)/duration),sec=(now-start)*.001;
 const thrust=Math.min(1,t*2.1),surge=thrust*thrust*(3-2*thrust),exit=Math.max(0,(t-.69)/.31);
 ctx.fillStyle='#020710';ctx.fillRect(0,0,w,h);
 const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,unit*1.5);
 glow.addColorStop(0,'rgba(89,177,255,'+(.25+.23*surge)+')');
 glow.addColorStop(.18,'rgba(32,94,165,.34)');
 glow.addColorStop(.49,'rgba(9,29,65,.45)');
 glow.addColorStop(1,'rgba(1,5,12,0)');
 ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
 for(let a=0;a<9;a++){
  ctx.beginPath();
  for(let step=0;step<=34;step++){
   const depth=step/34,angle=a*tau/9+sec*(2.3+1.5*surge)-depth*9.7;
   const radius=unit*(.013+1.68*depth*depth)*(.38+.62*surge);
   const x=cx+Math.cos(angle)*radius,y=cy+Math.sin(angle)*radius*.78;
   if(step===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
  }
  ctx.strokeStyle='rgba('+(a%2?'81,174,255':'151,225,255')+','+(.075+.07*surge)+')';
  ctx.lineWidth=1.5+a%3;ctx.stroke();
 }
 for(let i=0;i<38;i++){
  const z=(i/38+sec*(.30+.23*surge))%1;
  const radius=unit*(.019+1.42*z*z)*(.55+.45*surge);
  const opacity=(.07+.36*z)*Math.min(1,t*5);
  ctx.save();ctx.translate(cx,cy);ctx.rotate(sec*(i%2?-.33:.39)+z*1.7);
  ctx.beginPath();ctx.ellipse(0,0,radius,radius*.78,0,0,tau);
  ctx.lineWidth=.7+2.7*z;
  ctx.strokeStyle='rgba('+(i%3?'95,180,255':'182,232,255')+','+opacity+')';
  ctx.setLineDash([7+43*z,9+53*z]);
  ctx.lineDashOffset=sec*(i%2?60:-67);ctx.stroke();ctx.restore();
 }
 ctx.setLineDash([]);
 for(const s of stars){
  const z=(s.z+sec*(.28+.25*surge)*s.speed)%1;
  const p=.09+3.3*z*z*z,tail=(.022+.22*z)*(.38+surge),prev=Math.max(.06,p-tail);
  const x=cx+s.x*p*unit,y=cy+s.y*p*unit*.78;
  if(x< -50||x>w+50||y< -50||y>h+50)continue;
  ctx.beginPath();
  ctx.moveTo(cx+s.x*prev*unit,cy+s.y*prev*unit*.78);ctx.lineTo(x,y);
  const alpha=(.14+.8*z)*Math.min(1,t*7)*(1-.25*exit);
  ctx.strokeStyle=s.tint>.84?'rgba(244,251,255,'+alpha+')':s.tint>.4?'rgba(154,218,255,'+alpha+')':'rgba(79,152,251,'+alpha+')';
  ctx.lineWidth=.6+1.7*z;ctx.stroke();
 }
 const core=ctx.createRadialGradient(cx,cy,0,cx,cy,unit*(.11+.09*surge));
 core.addColorStop(0,'rgba(238,249,255,.9)');
 core.addColorStop(.21,'rgba(162,219,255,.78)');
 core.addColorStop(.48,'rgba(76,147,237,.36)');
 core.addColorStop(1,'rgba(34,77,156,0)');
 ctx.fillStyle=core;ctx.beginPath();ctx.arc(cx,cy,unit*(.11+.09*surge),0,tau);ctx.fill();
 if(t<.99){frame=requestAnimationFrame(draw);}else{cleanup();}
}
function cleanup(){
 if(disposed)return;disposed=true;cancelAnimationFrame(frame);
 window.removeEventListener('resize',resize);overlay.remove();
}
resize();window.addEventListener('resize',resize,{passive:true});
frame=requestAnimationFrame(draw);
document.addEventListener('visibilitychange',function(){
 if(!document.hidden&&start!==null&&!disposed&&performance.now()-start>duration)cleanup();
});
setTimeout(cleanup,5000);
})();