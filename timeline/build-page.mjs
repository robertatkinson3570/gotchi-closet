import fs from 'node:fs';
const TL='C:/Cursor/gotchi-closet/timeline';
const data=JSON.parse(fs.readFileSync(TL+'/timeline.json','utf8'));

const CSS = `
:root{--bg:#140d20;--bg2:#1d1430;--card:#241834;--line:#3a2a55;--ink:#ece6f7;--mut:#9d8fb8;--pink:#fa34f3;--blue:#3db8ff}
*{box-sizing:border-box}
body{margin:0;background:linear-gradient(180deg,#180f26,#140d20 40%);color:var(--ink);font:15px/1.5 'Segoe UI',system-ui,sans-serif}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
header{padding:28px 22px 14px;max-width:980px;margin:0 auto}
h1{margin:0 0 6px;font-size:30px;background:linear-gradient(90deg,#fa34f3,#7c5cff,#3db8ff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.sub{color:var(--mut);font-size:13px;max-width:760px}
.controls{position:sticky;top:0;z-index:5;background:rgba(20,13,32,.92);backdrop-filter:blur(6px);border-bottom:1px solid var(--line);padding:12px 22px}
.controls .row{max-width:980px;margin:0 auto;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
input#q{flex:1;min-width:180px;background:var(--bg2);border:1px solid var(--line);color:var(--ink);padding:8px 12px;border-radius:8px;font-size:14px}
.chipbtn{cursor:pointer;user-select:none;border:1px solid var(--line);background:var(--bg2);color:var(--mut);padding:5px 11px;border-radius:999px;font-size:12px;font-weight:600;display:inline-flex;align-items:center;gap:6px}
.chipbtn .dot{width:9px;height:9px;border-radius:50%}
.chipbtn.on{color:#fff}
.toggle{cursor:pointer;border:1px solid var(--line);background:var(--bg2);color:var(--mut);padding:6px 12px;border-radius:8px;font-size:12px;font-weight:600}
.toggle.on{background:var(--pink);color:#fff;border-color:var(--pink)}
#count{color:var(--mut);font-size:12px;margin-left:auto}
main{max-width:980px;margin:0 auto;padding:10px 22px 80px}
.era{margin:26px 0 8px}
.era>h2{font-size:18px;color:#d9c9ff;border-left:4px solid var(--pink);padding-left:10px;margin:18px 0 14px;position:sticky}
.evt{position:relative;margin:0 0 10px 18px;padding:12px 14px 12px 16px;background:var(--card);border:1px solid var(--line);border-left-width:4px;border-radius:10px}
.evt::before{content:'';position:absolute;left:-25px;top:18px;width:10px;height:10px;border-radius:50%;background:var(--c,#888);box-shadow:0 0 0 3px var(--bg)}
.rail{position:absolute;left:-21px;top:0;bottom:0;width:2px;background:var(--line)}
.evt .top{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.date{font-variant-numeric:tabular-nums;color:var(--mut);font-size:12px;font-weight:700;min-width:78px}
.title{font-weight:600;font-size:15px}
.chip{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;padding:2px 7px;border-radius:6px;color:#0c0814}
.summary{color:#c8bce0;font-size:13px;margin-top:5px}
.src{font-size:11px;color:var(--mut);margin-top:5px}
.t1{font-size:9px;color:#ffd24a;border:1px solid #5a4a1f;border-radius:4px;padding:1px 4px;font-weight:800}
.eralist{position:relative}
`;

function clientMain(){
  var D=window.DATA, events=D.events;
  var COL={game:'#ff6ad5',product:'#3db8ff',tokenomics:'#ffd24a',governance:'#b69bff',community:'#4ade80'};
  var LABEL={game:'game',product:'product',tokenomics:'tokenomics',governance:'governance',community:'community'};
  var state={cats:new Set(Object.keys(COL)),t1:false,q:''};
  var bar=document.getElementById('cats');
  Object.keys(COL).forEach(function(c){
    var b=document.createElement('span'); b.className='chipbtn on'; b.dataset.c=c;
    b.innerHTML='<span class="dot" style="background:'+COL[c]+'"></span>'+LABEL[c];
    b.onclick=function(){ if(state.cats.has(c)){state.cats.delete(c);b.classList.remove('on');}else{state.cats.add(c);b.classList.add('on');} render(); };
    bar.appendChild(b);
  });
  var tg=document.getElementById('t1'); tg.onclick=function(){state.t1=!state.t1;tg.classList.toggle('on',state.t1);render();};
  var q=document.getElementById('q'); q.oninput=function(){state.q=q.value.toLowerCase();render();};
  function esc(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function render(){
    var root=document.getElementById('tl'); root.innerHTML='';
    var f=events.filter(function(e){return state.cats.has(e.category)&&(!state.t1||e.tier===1)&&(!state.q||(e.title+' '+(e.summary||'')).toLowerCase().indexOf(state.q)>=0);});
    document.getElementById('count').textContent=f.length+' of '+events.length+' events';
    var by={}; f.forEach(function(e){(by[e.era]=by[e.era]||[]).push(e);});
    Object.keys(by).sort().forEach(function(era){
      var sec=document.createElement('section'); sec.className='era';
      var h=document.createElement('h2'); h.textContent=era.replace(/^\d+ - /,''); sec.appendChild(h);
      var wrap=document.createElement('div'); wrap.className='eralist';
      var rail=document.createElement('div'); rail.className='rail'; wrap.appendChild(rail);
      by[era].forEach(function(e){
        var c=COL[e.category]||'#888';
        var d=document.createElement('div'); d.className='evt'; d.style.borderLeftColor=c; d.style.setProperty('--c',c);
        var t1=e.tier===1?'<span class="t1">KEY</span>':'';
        var title=e.url?'<a class="title" href="'+e.url+'" target="_blank" rel="noopener">'+esc(e.title)+'</a>':'<span class="title">'+esc(e.title)+'</span>';
        var sm=e.summary?'<div class="summary">'+esc(e.summary)+'</div>':'';
        var src='<div class="src">'+esc(e.source||'')+(e.confidence&&e.confidence!=='high'?' · confidence: '+e.confidence:'')+'</div>';
        d.innerHTML='<div class="top"><span class="date">'+esc(e.date)+'</span>'+title+' <span class="chip" style="background:'+c+'">'+esc(e.category)+'</span> '+t1+'</div>'+sm+src;
        wrap.appendChild(d);
      });
      sec.appendChild(wrap); root.appendChild(sec);
    });
  }
  render();
}

var parts=[];
parts.push('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">');
parts.push('<title>Aavegotchi Historical Timeline</title><style>'+CSS+'</style></head><body>');
parts.push('<header><h1>&#128123; Aavegotchi Historical Timeline</h1>');
parts.push('<div class="sub">'+data.count+' events (2020&#8594;2026) from the Gotchi KB: blog, AGIP/DAO threads, and cross-checked genesis research. Click a title for its source. "KEY" marks tier-1 milestones.</div></header>');
parts.push('<div class="controls"><div class="row"><input id="q" placeholder="Search the timeline...">');
parts.push('<span class="toggle" id="t1">KEY milestones only</span><span id="cats"></span><span id="count"></span></div></div>');
parts.push('<main><div id="tl"></div></main>');
parts.push('<script>window.DATA='+JSON.stringify(data)+';</script>');
parts.push('<script>('+clientMain.toString()+')();</script>');
parts.push('</body></html>');
fs.writeFileSync(TL+'/timeline.html', parts.join('\n'));
console.log('wrote timeline.html ('+ (fs.statSync(TL+'/timeline.html').size/1024).toFixed(0) +' KB), '+data.count+' events embedded');
