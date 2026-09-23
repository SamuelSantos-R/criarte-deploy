// Nomes de saída. Um convite só: o usuário edita o nome antes de salvar.
// Uma pasta inteira: cada vídeo recebe "<nome da imagem>.abertura.mp4".
const fs=require('node:fs');
const path=require('node:path');

const IMAGE_EXTENSIONS=new Set(['.png','.jpg','.jpeg','.webp']);
const SUFFIX='.abertura';

function stemOf(file){return path.parse(file).name;}

function defaultName(file){return stemOf(file)+SUFFIX;}

// Só o que o Windows e o macOS aceitam num nome; nunca vazio.
function sanitizeName(name){
  const clean=String(name||'')
    .trim()
    .replace(/\.mp4$/i,'')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g,'')
    .trim()
    .replace(/[. ]+$/,'');
  return clean||'convite'+SUFFIX;
}

function listImages(dir){
  return fs.readdirSync(dir,{withFileTypes:true})
    .filter(entry=>entry.isFile()&&IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())&&!entry.name.startsWith('.'))
    .map(entry=>path.join(dir,entry.name))
    .sort((a,b)=>a.localeCompare(b,'pt',{numeric:true}));
}

// Nunca substitui um vídeo já salvo: acrescenta (2), (3)…
function uniquePath(dir,name){
  for(let n=1;;n++){
    const candidate=path.join(dir,name+(n===1?'':` (${n})`)+'.mp4');
    if(!fs.existsSync(candidate))return candidate;
  }
}

module.exports={IMAGE_EXTENSIONS,SUFFIX,stemOf,defaultName,sanitizeName,listImages,uniquePath};
