// WCAG 2.1 AA contrast check for every text/background pair the iron
// reskin uses (CLAUDE.md: re-verify with a calculation, not by eye).
// Run: node scripts/check-contrast.mjs - exits non-zero on any failure.
// Keep this list in step with the token sets at the top of
// public/index.html.
const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255)
  .map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const ratio=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05)};
const TEXT=4.5, UI=3; // 1.4.3 small text, 1.4.11 non-text
const grounds={
  page:'#14110D',           // dark page
  plate:'#D8D0BE',          // pale identity plate (centre)
  plateEdge:'#CFC7B5',      // plate under its edge vignette
  parch:'#DCCFAF',          // parchment lore / .block fallbacks
  parchEdge:'#D3C6A7',      // parchment under its edge vignette
  iron:'#1E1B18',           // black-iron stat strip
  tabbar:'#24211E', enamel:'#6E0F1B', crit:'#231012', you:'#2B2518',
};
const dark={ink:'#EAE0C8',faint:'#B5A684',rule:'#D2A85A',live:'#F72446',gild:'#D9B460',mend:'#7CC48B'};
const light={ink:'#17120D',faint:'#5C4F3C',rule:'#7A2718',live:'#A60B23',gild:'#5E4815',mend:'#2A5735'};
const iron={ink:'#EFE6D2',faint:'#B5A684',rule:'#D2A85A',live:'#FF5A6E'};
const pairs=[];
for(const[k,v]of Object.entries(dark))pairs.push([`page ${k}`,v,grounds.page,TEXT]);
pairs.push(['page hair','#6E6350',grounds.page,UI]);
for(const g of['plate','plateEdge','parch','parchEdge']){
  for(const[k,v]of Object.entries(light))pairs.push([`${g} ${k}`,v,grounds[g],TEXT]);
  pairs.push([`${g} hair`,'#6E6450',grounds[g],UI]);
}
for(const[k,v]of Object.entries(iron))pairs.push([`iron ${k}`,v,grounds.iron,TEXT]);
pairs.push(
  ['hp fill vs track','#C0102A','#0E0C0A',UI],
  ['tab label',dark.rule,grounds.tabbar,TEXT],
  ['tab active label','#F3D892',grounds.enamel,TEXT],
  ['section pennant text','#F3D892',grounds.enamel,TEXT],
  ['focus ring on page','#F3D892',grounds.page,UI],
  ['focus ring on tab bar','#F3D892',grounds.tabbar,UI],
  ['focus ring on plate',light.ink,grounds.plate,UI],
  ['go button','#FFFFFF','#9E0E22',TEXT],
  ['go disabled','#E8DFC9','#4A4136',TEXT],
  ['badge','#FFFFFF','#B00C26',TEXT],
  ['crit row',dark.ink,grounds.crit,TEXT],['crit amount',dark.live,grounds.crit,TEXT],
  ['current floor row name',dark.live,grounds.crit,TEXT],
  ['your guild row',dark.ink,grounds.you,TEXT],
  ['bench current row (lore)',light.ink,'#CDBE98',TEXT],
  ['masthead live',dark.live,'#17120D',TEXT],
);
let bad=0;
for(const[l,f,b,m]of pairs){const r=ratio(f,b);if(r<m)bad++;
  console.log(`${r>=m?'ok  ':'FAIL'} ${r.toFixed(2).padStart(5)}  (≥${m})  ${l}  ${f} on ${b}`);}
console.log(bad?`\n${bad} pair(s) fail`:'\nall pairs pass');
process.exit(bad?1:0);
