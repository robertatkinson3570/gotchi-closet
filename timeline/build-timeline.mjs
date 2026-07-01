import fs from 'node:fs';
const TL='C:/Cursor/gotchi-closet/timeline';
const EX='C:/tools/dce/exports';
const genesis=JSON.parse(fs.readFileSync(TL+'/genesis-events.json','utf8'))
  .map(e=>({...e,source:'external research',url:(e.sources||[])[0]||'',tier:e.confidence==='high'?1:2}));

const ev=[...genesis];
// blog
const blog=JSON.parse(fs.readFileSync(EX+'/aavegotchi-web/Aavegotchi Blog [blog].json','utf8'));
blog.messages.filter(m=>/-0$/.test(m.id)).forEach(m=>{
  const [t,u]=m.content.split('\n'); ev.push({date:m.timestamp.slice(0,10),title:t.slice(0,90),summary:'',source:'blog',url:u||'',confidence:'high'});
});
// AGIP / forum-dao
for(const f of fs.readdirSync(EX+'/aavegotchi-forum-dao')){ if(!f.endsWith('.json'))continue;
  const j=JSON.parse(fs.readFileSync(EX+'/aavegotchi-forum-dao/'+f,'utf8'));
  if(j.channel?.id==='dao-call-transcripts')continue;
  const ts=(j.messages||[]).map(m=>m.timestamp).filter(Boolean).sort()[0];
  if(ts&&j.channel?.name) ev.push({date:ts.slice(0,10),title:j.channel.name.trim().slice(0,90),summary:'',source:'AavegotchiDAO governance forum',url:'',confidence:'high'});
}

function cat(t){t=t.toLowerCase();
  if(/rarit|rf |season|battler|guardian|game|gotchiverse|land|parcel|wearable|portal|haunt|kinship|brs|reroll/.test(t))return /dao|director|quorum|governance|proposal|signer|corpsec|foundation/.test(t)?'governance':'game';
  if(/dao|director|quorum|governance|signer|corpsec|foundation|vote|snapshot|agip|election/.test(t))return 'governance';
  if(/ghst|treasury|eth |distribution|staking|stake|buy ?back|liquidity|token|sell|aero|budget|funding|acquisition/.test(t))return 'tokenomics';
  if(/migrat|base|polygon|geist|launch|release|app|dapp|infrastructure/.test(t))return 'product';
  return 'community';}

function era(d){const y=d.slice(0,4),m=d.slice(0,7);
  if(y<='2020')return '1 - Genesis (2020)';
  if(y==='2021')return '2 - Portals & Mainnet (2021)';
  if(y==='2022')return '3 - Gotchiverse Era (2022)';
  if(y==='2023')return '4 - Games & Expansion (2023)';
  if(y==='2024')return '5 - DAO Maturation (2024)';
  if(y==='2025')return (m<='2025-06'?'6 - Road to Base (2025 H1)':'7 - Base Migration & Distribution (2025 H2)');
  return '8 - Community-Run / Survival (2026)';}

const T1BLOG=/migrat|mainnet|\blaunch|now live|has launched|is live|introduc|announc|reveal|coming|released|wave|haunt|gotchiverse|alpha|beta|season \d|based|steam|airdrop|3d|guardians/i;
const T1AGIP=/make .*based|eth distribution|funding renewal|acquisition|treasury distribution|institutional framework|director.{0,3} election|crisis of identity|life after distribution|phoenix|make aavegotchi|moving liquidity|stake it and chill/i;

for(const e of ev){
  e.category=e.category||cat(e.title);
  e.era=era(e.date);
  if(e.tier==null){ e.tier = (e.source==='blog'? (T1BLOG.test(e.title)?1:2) : (T1AGIP.test(e.title)?1:3)); }
}
ev.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
fs.writeFileSync(TL+'/timeline.json',JSON.stringify({generated:'2026-06-21',count:ev.length,events:ev},null,1));

// digest of tier-1 by era for authoring
const byEra={};
for(const e of ev){ if(e.tier===1){(byEra[e.era]=byEra[e.era]||[]).push(e)} }
console.log('total events:',ev.length,'| tier1:',ev.filter(e=>e.tier===1).length,'| tier2:',ev.filter(e=>e.tier===2).length);
for(const k of Object.keys(byEra).sort()){
  console.log('\n### '+k+'  ('+byEra[k].length+' tier-1)');
  for(const e of byEra[k]) console.log(`${e.date} [${e.category}] ${e.title}`);
}
