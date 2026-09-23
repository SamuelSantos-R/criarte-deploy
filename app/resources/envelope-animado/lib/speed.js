// Velocidade da abertura. "Normal" é a duração medida na referência Grok
// (playback.json); "personalizada" divide essa duração por um fator entre
// 0,5× (metade da velocidade, vídeo mais longo) e 2× (o dobro, mais curto).
// A curva de ritmo (início suave, aceleração) é a mesma nos dois modos.
const playback=require('../playback.json');

const NORMAL_SECONDS=playback.openingSeconds;
const MIN_FACTOR=0.5,MAX_FACTOR=2;

function clampFactor(factor){
  if(!Number.isFinite(factor))return 1;
  return Math.min(MAX_FACTOR,Math.max(MIN_FACTOR,Math.round(factor*20)/20));
}

function openingSeconds(mode,factor){
  if(mode!=='custom')return NORMAL_SECONDS;
  return NORMAL_SECONDS/clampFactor(factor);
}

module.exports={NORMAL_SECONDS,MIN_FACTOR,MAX_FACTOR,clampFactor,openingSeconds};
