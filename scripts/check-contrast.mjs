// WCAG 2.1 AA contrast check for every text/background pair the iron
// reskin uses (CLAUDE.md: re-verify with a calculation, not by eye).
// Run: node scripts/check-contrast.mjs - exits non-zero on any failure.
//
// Textured surfaces are tested against their WORST pixel, not an average:
// scripts/cut-ui-kit.py tints each texture exactly as the CSS does and
// writes the 1st/99th-percentile pixel to public/assets/ui/grounds.json.
// Keep the text tokens below in step with the top of public/index.html.
import {readFileSync} from 'node:fs';
const G=JSON.parse(readFileSync(new URL('../public/assets/ui/grounds.json',import.meta.url)));
const lum=h=>{const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255)
  .map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const ratio=(a,b)=>{const[x,y]=[lum(a),lum(b)].sort((p,q)=>q-p);return (x+.05)/(y+.05)};
const TEXT=4.5, UI=3; // 1.4.3 small text, 1.4.11 non-text

const dark ={ink:'#EAE0C8',faint:'#B5A684',rule:'#D2A85A',live:'#FF6B7D',gild:'#D9B460',mend:'#7CC48B'};
const light={ink:'#17120D',faint:'#4A3F30',rule:'#6A2014',live:'#8E0A1E',gild:'#4C3A0E',mend:'#22482C'};
const iron ={ink:'#EFE6D2',faint:'#B5A684',rule:'#D2A85A',live:'#FF5A6E'};
const hair ={dark:'#9A8C70',light:'#5E5544'};

const pairs=[];
const set=(name,tokens,ground)=>{for(const[k,v]of Object.entries(tokens))pairs.push([`${name} ${k}`,v,ground,TEXT]);};
set('page',dark,G.page.worst);           pairs.push(['page hair',hair.dark,G.page.worst,UI]);
set('plate',light,G.plate.worst);        pairs.push(['plate hair',hair.light,G.plate.worst,UI]);
set('parch',light,G.parch.worst);        pairs.push(['parch hair',hair.light,G.parch.worst,UI]);
set('iron',iron,G.iron.worst);
pairs.push(
  ['tab label','#E2BE70',G.tabbar.worst,TEXT],
  ['tab active label','#F3D892',G.tabon.worst,TEXT],
  ['section pennant text','#F3D892',G.velvet.worst,TEXT],
  ['focus ring on page','#F3D892',G.page.worst,UI],
  ['focus ring on tab bar','#F3D892',G.tabbar.worst,UI],
  ['focus ring on plate',light.ink,G.plate.worst,UI],
  ['hp fill vs iron track','#C0102A','#0E0C0A',UI],
  ['go button','#FFFFFF','#9E0E22',TEXT],
  ['go disabled','#E8DFC9','#4A4136',TEXT],
  ['badge','#FFFFFF','#B00C26',TEXT],
  ['crit row',dark.ink,'#231012',TEXT],['crit amount',dark.live,'#231012',TEXT],
  ['current floor row name',dark.live,'#231012',TEXT],
  ['your guild row',dark.ink,'#2B2518',TEXT],
  ['bench current row (lore)',light.ink,'#CDBE98',TEXT],
  ['masthead live','#F72446','#17120D',TEXT],
);
let bad=0;
for(const[l,f,b,m]of pairs){const r=ratio(f,b);if(r<m)bad++;
  console.log(`${r>=m?'ok  ':'FAIL'} ${r.toFixed(2).padStart(5)}  (≥${m})  ${l}  ${f} on ${b}`);}
console.log(bad?`\n${bad} pair(s) fail`:`\nall ${pairs.length} pairs pass`);
process.exit(bad?1:0);
