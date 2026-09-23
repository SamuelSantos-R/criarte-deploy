// Preferências que sobrevivem entre sessões: pasta de saída, velocidade e a
// última pasta de entrada. Um JSON pequeno em userData; nunca lança ao ler.
const fs=require('node:fs');
const path=require('node:path');
const {NORMAL_SECONDS,clampFactor}=require('./speed');

const DEFAULTS=Object.freeze({
  outDir:null,           // null = a pasta "saida" ao lado do programa até o usuário escolher
  speedMode:'normal',    // 'normal' usa a curva medida; 'custom' aplica o fator
  speedFactor:1,
  lastInputDir:null,
});

function sanitize(raw){
  const s={...DEFAULTS};
  if(raw&&typeof raw==='object'){
    if(typeof raw.outDir==='string'&&raw.outDir)s.outDir=raw.outDir;
    if(raw.speedMode==='custom')s.speedMode='custom';
    if(Number.isFinite(raw.speedFactor))s.speedFactor=clampFactor(raw.speedFactor);
    if(typeof raw.lastInputDir==='string'&&raw.lastInputDir)s.lastInputDir=raw.lastInputDir;
  }
  return s;
}

function createSettings(file){
  let current=sanitize(null);
  try{current=sanitize(JSON.parse(fs.readFileSync(file,'utf8')));}catch(e){/* primeira execução ou arquivo corrompido: padrões */}
  return {
    get(){return {...current};},
    update(patch){
      current=sanitize({...current,...patch});
      fs.mkdirSync(path.dirname(file),{recursive:true});
      const temporary=file+'.tmp';
      fs.writeFileSync(temporary,JSON.stringify(current,null,2));
      fs.renameSync(temporary,file);
      return {...current};
    },
  };
}

module.exports={createSettings,DEFAULTS,NORMAL_SECONDS};
