// Damage/HP math shared between the live app (public/index.html) and the
// build-time season-state script (scripts/compute-season-state.mjs) - one
// place for these formulas, not two copies that can drift out of sync
// with a tuning change (CLAUDE.md: "Formulas live in one place, not
// duplicated"). A real ES module on purpose, loaded by <script
// type="module"> in the browser and by `import` in Node - not a classic
// script + a hand-copied Node port.

// The one number off index.html's FLAVOR sheet (art, class names,
// traits) that a formula actually needs - canonical here, FLAVOR.max
// reads from it, not the other way around.
export const MAX_HP = { wall:74, breaker:44, tactician:52, hunter:48, rogue:46, mender:36 };

// Canonical party order - matches buildParty()'s slot order and the
// order a Mender's heal pool distributes in. Not ARRIVAL_ORDER, which is
// drive-reveal order, not heal-distribution order.
export const SLOT_ORDER = ['wall','breaker','tactician','hunter','rogue','mender'];

// volume/burst split per class (CLAUDE.md conversion table) - a floor's
// mechanic scales these two terms independently (see FLOOR_MECHANICS
// below). Hunter's burst rate matches Rogue's (60/TD) - a receiving TD
// and a rushing TD score the same in standard fantasy scoring (6pts),
// unlike a passing TD (Tactician, usually 4pts, rate 45) - so Hunter
// isn't pure volume after all, just steadier than Rogue's yardage-driven
// variance. Mender still has no burst term - a made kick has no
// explosive-play concept to isolate. Wall stays 0/0 - no O-line dmg
// formula exists (CLAUDE.md's known data problem).
export function dmgParts(k,r){
  switch(k){
    case 'tactician': return {volume:Math.round(r.y*0.55),burst:r.td*45};
    case 'hunter': return {volume:Math.round(r.y*1.1)+r.c*6,burst:r.td*60};
    case 'rogue': return {volume:Math.round(r.y*1.3),burst:r.td*60};
    case 'breaker': return {volume:r.tfl*22,burst:r.sk*70};
    case 'mender': return {volume:r.fg*14,burst:0};
    default: return {volume:0,burst:0};
  }
}
// Floor modifiers (CLAUDE.md): Swarm halves the big-play term and leaves
// volume unreduced; Sentinel halves volume and doubles burst. Defaults
// to 'swarm' - Floor I, the only floor wired into live gameplay.
export const FLOOR_MECHANICS={
  swarm:{vol:1,burst:0.5},
  sentinel:{vol:0.5,burst:2},
};
export function dmgFor(k,r,mechanic='swarm'){
  const {volume,burst}=dmgParts(k,r);
  const m=FLOOR_MECHANICS[mechanic]||{vol:1,burst:1};
  return Math.round(volume*m.vol+burst*m.burst);
}

// The numeric half of one slot's drive - room damage, whether it crits,
// and what it costs the party (take, before the Wall's soak; or heal for
// the Mender). Flavor text lives with the caller (index.html's `drives`)
// since it's presentation, not a formula.
export function resolveDrive(slot, r, mechanic='swarm'){
  const dmg = dmgFor(slot, r, mechanic);
  switch(slot){
    case 'wall': return {dmg,crit:false,take:0};
    case 'tactician': return {dmg,crit:r.td>=1,take:r.sk*6};
    case 'hunter': return {dmg,crit:r.td>=1,take:0};
    case 'rogue': return {dmg,crit:r.td>=1,take:Math.round(r.car*0.7)};
    case 'breaker': return {dmg,crit:r.sk>=1,take:0};
    case 'mender': return {dmg,crit:false,heal:r.fg*7,miss:r.att-r.fg};
    default: return {dmg,crit:false,take:0};
  }
}

// Applies one resolved drive to room HP and party HP - the Wall soaks
// 40% of a `take` first, a Mender's heal pool distributes up to 9 per
// member in SLOT_ORDER, every hp clamps at 0. Pure: takes a hp map, hands
// back a new one, mutates nothing - so a live commit() (called once per
// tap) and a build-time replay (called once per slot in a fixed order)
// run exactly the same arithmetic.
export function applyDrive(hp, roomHp, slot, result){
  const next={...hp};
  roomHp-=result.dmg;
  if(result.heal){
    let pool=result.heal;
    for(const k of SLOT_ORDER){
      if(pool<=0)break;
      if(next[k]<MAX_HP[k]){
        const g=Math.min(pool,MAX_HP[k]-next[k],9);
        next[k]+=g;pool-=g;
      }
    }
  }
  // soak returned too - callers (the live log line, a season-state
  // summary) need "the Wall absorbed N" without recomputing it.
  let soak=0;
  if(result.take){
    soak=Math.min(next.wall,Math.round(result.take*0.4));
    next.wall-=soak;
    next[slot]-=(result.take-soak);
  }
  for(const k of SLOT_ORDER) if(next[k]<0) next[k]=0;
  return {hp:next, roomHp, soak};
}

// Season-progression rules (CLAUDE.md, decided): each party member
// regains 15% of max HP between weeks, capped at max - partial recovery
// (attrition still matters over a season), not zero (a single Mender's
// weekly heal isn't the only thing keeping a party alive).
export function regenHp(hp, pct=0.15){
  const next={...hp};
  for(const k of SLOT_ORDER) next[k]=Math.min(MAX_HP[k], next[k]+Math.round(MAX_HP[k]*pct));
  return next;
}
