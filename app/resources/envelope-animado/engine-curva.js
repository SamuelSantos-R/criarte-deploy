// Renderização local por camadas e campo de luz calibrado. Nenhum pixel de impressão
// do vídeo de referência é usado: todo texto, ornamento e lacre vêm da entrada.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');
const { detectSeal, segmentSeal } = require('./lib/detection');
const {placeSeal}=require('./lib/seal-pose');
const {placePrint}=require('./lib/printed-paper');
const {playbackFrames,playbackPositions,pesosDoObturador}=require('./lib/playback');

// Empacotado (Electron), o código vive dentro de app.asar; sharp e ffmpeg abrem
// arquivos direto no disco e não enxergam o asar, por isso `perfis/` e os
// binários ficam desempacotados (asarUnpack) e o caminho é trocado aqui.
const unpacked = p => p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
const PROFILE = unpacked(path.join(__dirname, 'perfis', 'curva-pmm'));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
// Tabela da luz: LUZ[s*256+v] é o que `Math.round(v*(s/255))` dava, pixel a
// pixel, dentro do renderFrame. Calculada uma vez em vez de 5 milhões por quadro.
const LUZ=new Uint8Array(256*256);
for(let s=0;s<256;s++)for(let v=0;v<256;v++)LUZ[s*256+v]=Math.round(v*(s/255));

function measureFlap(data,w,h,approx) {
  const gray=(x,y)=>{const p=(Math.round(y)*w+Math.round(x))*3;return .299*data[p]+.587*data[p+1]+.114*data[p+2];};
  const lines=[];
  for(const side of [-1,1]){
    const points=[];
    for(let t=.18;t<=.30;t+=.02){
      const x=(side<0?t:1-t)*w,pred=(approx.cy+.09-Math.abs(x/w-.5)*.83)*h;
      let best=-Infinity,by=pred;
      for(let y=Math.round(pred-h*.045);y<pred+h*.045;y++){
        const score=gray(x,y-2)-gray(x,y+2);
        if(score>best){best=score;by=y;}
      }
      if(best>2)points.push([x,by]);
    }
    const n=points.length,sx=points.reduce((s,p)=>s+p[0],0),sy=points.reduce((s,p)=>s+p[1],0);
    const sxx=points.reduce((s,p)=>s+p[0]*p[0],0),sxy=points.reduce((s,p)=>s+p[0]*p[1],0);
    const a=n>2?(n*sxy-sx*sy)/(n*sxx-sx*sx):side<0?.83*h/w:-.83*h/w;
    const b=n>2?(sy-a*sx)/n:(approx.cy+.09)*h-a*w*.5;
    lines.push({a,b});
  }
  const profile=JSON.parse(fs.readFileSync(path.join(PROFILE,'perfil.json'),'utf8'));
  return {hinge:profile.textBox[1]/profile.height*h,lines};
}

function paperBoundary(plate,w,h) {
  const edge=new Float32Array(w).fill(h);
  // O verso sobe acima de 20% da altura. Começar nessa altura cortava a curva
  // em uma reta; buscar desde a área vazia acima de toda a trajetória.
  for(let x=0;x<w;x++)for(let y=Math.round(h*.10);y<Math.round(h*.80);y++){
    const value=plate[y*w+x];
    if(value<246){
      const previous=plate[(y-1)*w+x];
      edge[x]=y-1+clamp((previous-246)/Math.max(1,previous-value),0,1);break;
    }
  }
  return edge;
}

async function prepare(input, width = 1080) {
  if(typeof input!=='string' || !fs.existsSync(input)) throw new Error('Escolha uma imagem PNG, JPG ou WebP que exista no computador.');
  if(!Number.isInteger(width) || width<128 || width>2160) throw new Error('A largura de saída deve ficar entre 128 e 2160 pixels.');
  const metadata = await sharp(input).metadata();
  // Detecção, recorte e composição precisam enxergar a mesma orientação EXIF.
  const oriented = metadata.orientation > 1 ? await sharp(input).rotate().png().toBuffer() : input;
  const source = await sharp(oriented).resize({ width }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = source;
  const { width: w, height: h } = info;
  const approx = await detectSeal(oriented);
  if (!approx.found) throw new Error('Não consegui identificar o lacre neste convite.');
  const paper = approx.paperRgb;
  const seal = await segmentSeal(oriented, approx, paper);
  const sealWidth=Math.round(seal.w*w),sealHeight=Math.round(sealWidth*seal.ar);
  const sealTexture=await sharp(Buffer.from(seal.texSeal.split(',')[1],'base64')).resize(sealWidth,sealHeight).ensureAlpha().raw().toBuffer();
  seal.texture={data:sealTexture,width:sealWidth,height:sealHeight};
  const flap=measureFlap(data,w,h,approx);
  // Dividir cada pixel pela superfície, não mover uma flor inteira por estar
  // na metade superior. Só a faixa entre dobradiça e diagonais pertence à aba.
  const candidates=Buffer.alloc(w*h),ornamentMask=Buffer.alloc(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
    if(x>w*.23&&x<w*.77)continue;
    const p=y*w+x,k=p*3,r=[data[k]/paper[0],data[k+1]/paper[1],data[k+2]/paper[2]];
    if(Math.max(...r)-Math.min(...r)>.025||Math.max(...r)>1.025)candidates[p]=1;
  }
  const queue=new Int32Array(w*h);let head=0,tail=0;
  const visit=p=>{if(candidates[p]&&!ornamentMask[p]){ornamentMask[p]=1;queue[tail++]=p;}};
  for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}
  while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
      if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)visit((y+dy)*w+x+dx);
  }
  const fixed=Buffer.from(ornamentMask),ornaments=Buffer.alloc(w*h*4),flapArt=Buffer.alloc(w*h*4);
  for(let p=0;p<ornamentMask.length;p++)if(ornamentMask[p]){
    const x=p%w,y=Math.floor(p/w);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)
      if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h)fixed[(y+dy)*w+x+dx]=1;
  }
  // Uma ponta do ramo pode cruzar a diagonal desenhada na imagem. Se continua
  // ligada ao arranjo superior que toca a aba, não deve virar um fragmento fixo
  // isolado depois da abertura. Mantém-se fixa a parte acima da dobradiça.
  const extension=Buffer.alloc(w*h),visited=Buffer.alloc(w*h);
  const sealTop=approx.cy*h-approx.r*w;
  for(let seed=0;seed<fixed.length;seed++)if(fixed[seed]&&!visited[seed]){
    head=0;tail=0;queue[tail++]=seed;visited[seed]=1;
    let minY=h,maxY=0,touches=false;
    while(head<tail){
      const p=queue[head++],x=p%w,y=Math.floor(p/w),line=flap.lines[x<w/2?0:1];
      minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      if(y>=flap.hinge&&y<=line.a*x+line.b)touches=true;
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const xx=x+dx,yy=y+dy,q=yy*w+xx;
        if(xx>=0&&xx<w&&yy>=0&&yy<h&&fixed[q]&&!visited[q]){visited[q]=1;queue[tail++]=q;}
      }
    }
    if(touches&&minY<flap.hinge&&maxY<sealTop)
      for(let k=0;k<tail;k++)extension[queue[k]]=1;
  }
  for(let p=0;p<fixed.length;p++)if(fixed[p]){
    const x=p%w,y=Math.floor(p/w),line=flap.lines[x<w/2?0:1];
    const layer=y>=flap.hinge&&(y<=line.a*x+line.b||extension[p])?flapArt:ornaments;
    layer[p*4]=data[p*3];layer[p*4+1]=data[p*3+1];layer[p*4+2]=data[p*3+2];layer[p*4+3]=255;
  }
  const base = Buffer.from(data);
  const ink = Buffer.alloc(w*h*4);
  const top = Math.round(h*.255), bottom = Math.round(approx.cy*h - approx.r*w*1.12);
  // As regiões impressas da aba são independentes das sombras de papel.
  // Distância cromática + contraste local conserva também impressão preta.
  const gray = await sharp(data, {raw:info}).greyscale().raw().toBuffer();
  const smooth = await sharp(gray,{raw:{width:w,height:h,channels:1}}).blur(4).greyscale().raw().toBuffer();
  for (let y=top; y<bottom; y++) for(let x=0;x<w;x++) {
    const i=y*w+x, d=i*3, ratios=[data[d]/paper[0],data[d+1]/paper[1],data[d+2]/paper[2]];
    const chroma=Math.max(...ratios)-Math.min(...ratios);
    const contrast=(smooth[i]-gray[i])/255;
    // Evitar as duas diagonais: a impressão precisa estar dentro da aba.
    const edge = Math.abs(x/w-.5)*2;
    const inside = y/h < approx.cy+.075-edge*.415-.012;
    const alpha = inside && (chroma>.04 || contrast>.03 || Math.min(...ratios)<.5) ? 1 : 0;
    const a=i*4;
    ink[a]=data[d]; ink[a+1]=data[d+1]; ink[a+2]=data[d+2]; ink[a+3]=Math.round(alpha*255);
  }
  // Inclui o antialias original ao redor da impressão, sem recalcular sua cor.
  const mask=Buffer.alloc(w*h);
  for(let p=0;p<w*h;p++) mask[p]=ink[p*4+3];
  for(let y=top;y<bottom;y++) for(let x=1;x<w-1;x++) {
    let a=0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) a=Math.max(a,mask[(y+dy)*w+x+dx]||0);
    const p=y*w+x;ink[p*4]=data[p*3];ink[p*4+1]=data[p*3+1];ink[p*4+2]=data[p*3+2];ink[p*4+3]=fixed[p]?0:a;
  }
  for(let p=0;p<fixed.length;p++)if(fixed[p])ink[p*4+3]=0;
  // Remover a região do envelope, mantendo integralmente os ornamentos periféricos.
  // Esta região será recomposta pela cor própria do papel e pelo material de luz.
  for(let y=Math.round(h*.255);y<Math.round(h*.785);y++) for(let x=0;x<w;x++) {
    const i=(y*w+x)*3;
    const edge=Math.abs(x/w-.5)*2;
    const envelope=y/h<approx.cy+.085-edge*.415+.04;
    const onSeal=Math.hypot(x-approx.cx*w,y-approx.cy*h)<approx.r*w*1.35;
    if(!envelope && !onSeal) continue;
    base[i]=paper[0];base[i+1]=paper[1];base[i+2]=paper[2];
  }
  // Toda arte sai do fundo: sua visibilidade será decidida pela superfície.
  // Deixá-la também no fundo fazia a flor aparecer através do verso da aba.
  for(let p=0;p<w*h;p++)if(fixed[p])for(let c=0;c<3;c++)base[p*3+c]=paper[c];
  return {width:w,height:h,base,original:data,paper,seal,approx,flap,flapArt:await sharp(flapArt,{raw:{width:w,height:h,channels:4}}).png().toBuffer(),ornaments,inkTexture:{data:ink,width:w,height:h,bounds:{top,bottom}},ink:await sharp(ink,{raw:{width:w,height:h,channels:4}}).png().toBuffer(),top,bottom};
}

async function loadPlates(profile, width, height) {
  const plates=[];
  const read=createPlateReader(profile,width,height);
  for(let i=0;i<profile.frameCount;i++) {
    plates.push(await read(i));
  }
  return plates;
}

function createPlateReader(profile,width,height) {
  // Várias poses são desenhadas ao mesmo tempo, e cada uma pede a sua placa.
  // Com uma cache de uma página só, pedidos intercalados de páginas diferentes
  // voltavam a decodificar o atlas inteiro a cada vez.
  const paginas=new Map(), placas=new Map(), LIMITE_PLACAS=24;
  const pagina=idx=>{
    if(!paginas.has(idx))paginas.set(idx,sharp(path.join(profile.materialDir||PROFILE,`papel-${String(idx).padStart(2,'0')}.png`)).greyscale().raw().toBuffer({resolveWithObject:true}));
    return paginas.get(idx);
  };
  return i=>{
    if(placas.has(i))return placas.get(i);
    const pronta=pagina(Math.floor(i/profile.atlasFrames)).then(cached=>
      sharp(cached.data,{raw:cached.info}).extract({left:0,top:(i%profile.atlasFrames)*profile.height,width:profile.width,height:profile.height}).resize(width,height).greyscale().raw().toBuffer());
    placas.set(i,pronta);
    if(placas.size>LIMITE_PLACAS)placas.delete(placas.keys().next().value);
    return pronta;
  };
}

async function renderFrame(prepared, profile, plate, i, cru=false) {
  const {width:w,height:h,base,paper,seal,ink}=prepared;
  const f=profile.frames[i];
  if(plate.length!==w*h) throw new Error('Perfil inválido: o campo de luz deve ter um canal por pixel.');
  if(i===0) return cru?Buffer.from(prepared.original):sharp(prepared.original,{raw:{width:w,height:h,channels:3}}).png().toBuffer();
  const rgb=Buffer.from(base);
  for(let p=0,q=0;p<plate.length;p++,q+=3) {
    const s=plate[p];
    if(s<255){const o=s<<8;rgb[q]=LUZ[o+rgb[q]];rgb[q+1]=LUZ[o+rgb[q+1]];rgb[q+2]=LUZ[o+rgb[q+2]];}
  }
  const overlays=[];
  const edge=paperBoundary(plate,w,h);
  // Impressão na folha fixa permanece em suas coordenadas, mas o papel que
  // passa à frente a encobre pela curva real. Não desenhar a flor por cima do verso.
  const stationary=Buffer.from(prepared.ornaments);
  for(let y=0;y<Math.ceil(prepared.flap.hinge);y++)for(let x=0;x<w;x++){
    const p=(y*w+x)*4;
    if(stationary[p+3])stationary[p+3]=Math.round(stationary[p+3]*clamp(edge[x]-y+.5,0,1));
  }
  overlays.push({input:stationary,raw:{width:w,height:h,channels:4},left:0,top:0});
  if(profile.printLines)overlays.push(...placePrint(prepared.inkTexture,profile,i));
  if(f.textScore>.4 && f.textScale>.02) {
    const y0=profile.textBox[1]/profile.height*h;
    const offset=f.textY/profile.height*h-y0*f.textScale;
    const ih=Math.max(1,Math.round(h*f.textScale));
    if(!profile.printLines){
      const resized=await sharp(ink).resize(w,ih,{fit:'fill'}).png().toBuffer();
      overlays.push({input:resized,left:0,top:Math.round(offset)});
    }
    // Mesma transformação da face impressa. As curvas/verso do papel ocluem
    // a impressão quando passam à frente; nada fica colado sobre a aba aberta.
    const art=await sharp(prepared.flapArt).resize(w,ih,{fit:'fill'}).raw().toBuffer();
    const dy=Math.round(offset);
    for(let y=0;y<ih;y++)for(let x=0;x<w;x++){
      const p=(y*w+x)*4,yy=y+dy;
      if(yy<0||yy>=h)art[p+3]=0;
      else art[p+3]=Math.round(art[p+3]*clamp(edge[x]-yy+.5,0,1));
    }
    overlays.push({input:art,raw:{width:w,height:ih,channels:4},left:0,top:dy});
  }
  const sw=Math.round(seal.w*w),sh=Math.round(sw*seal.ar);
  // Começa no lacre real da entrada e termina na dobra do perfil. Somar somente
  // o deslocamento deixava lacres menores flutuando acima da dobra no fim.
  const start=profile.frames[0],end=profile.frames[profile.frameCount-1];
  const pose=f.sealPose||{x:f.sealX,y:f.sealY};
  const progress=clamp((start.sealY-pose.y)/(start.sealY-end.sealY),0,1);
  const cx=pose.x/profile.width*w+(seal.cx-start.sealX/profile.width)*w*(1-progress);
  const cy=pose.y/profile.height*h+(seal.cy-start.sealY/profile.height)*h*(1-progress);
  if(f.sealPose)overlays.push(placeSeal(seal.texture,cx,cy,pose.matrix));
  else {
    const st=await sharp(Buffer.from(seal.texSeal.split(',')[1],'base64')).resize(sw,sh).png().toBuffer();
    overlays.push({input:st,left:Math.round(cx-sw/2),top:Math.round(cy-sh/2)});
  }
  const composed=sharp(rgb,{raw:{width:w,height:h,channels:3}}).composite(overlays);
  if(i<6) {
    const rendered=await composed.removeAlpha().raw().toBuffer();
    const mix=i/6;
    for(let j=0;j<rendered.length;j++)rendered[j]=Math.round(prepared.original[j]*(1-mix)+rendered[j]*mix);
    return cru?rendered:sharp(rendered,{raw:{width:w,height:h,channels:3}}).png().toBuffer();
  }
  return cru?composed.removeAlpha().raw().toBuffer():composed.png().toBuffer();
}

async function generate(input,opts={}) {
  const root=opts.root||__dirname, outDir=opts.outDir||path.join(root,'saida');
  fs.mkdirSync(outDir,{recursive:true});
  const profile=opts.profile||JSON.parse(fs.readFileSync(path.join(PROFILE,'perfil.json'),'utf8'));
  const playback=JSON.parse(fs.readFileSync(path.join(__dirname,'playback.json'),'utf8'));
  // A curva de ritmo (início suave, aceleração) vale em qualquer duração:
  // velocidade personalizada só estica ou encolhe o relógio.
  const seconds=opts.durationSeconds??playback.openingSeconds, curve=opts.uniform?undefined:playback.progress;
  // `suavizar:false` devolve o comportamento original, pose inteira por quadro.
  const suavizar=opts.suavizar!==false;
  const frames=suavizar?playbackPositions(profile,seconds,curve):playbackFrames(profile,seconds,curve);
  const progress=opts.onProgress||(()=>{}),start=Date.now();
  const checkAbort=()=>{if(opts.signal?.aborted)throw new Error('Geração cancelada. O convite original foi preservado.');};
  const report=(phase,fraction,extra={})=>{const elapsedSec=(Date.now()-start)/1000;progress({phase,fraction,elapsedSec,etaSec:fraction>.05?elapsedSec*(1-fraction)/fraction:null,...extra});};
  checkAbort();
  report('prepare',.01);
  // Quem desenha as poses: várias threads, ou este processo quando só há um
  // núcleo para dar (ou quando pedem `threads:1`). O desenho é o mesmo nos dois.
  const nucleos=require('node:os').cpus().length;
  // Perfil passado como objeto não viaja para as threads (elas leem do disco):
  // nesse caso, uma thread só, e o resultado é o mesmo.
  const quantas=opts.profile?1:Math.max(1,Math.min(opts.threads??(nucleos-1),nucleos));
  let desenhista;
  if(quantas>1){
    const {abrirDesenhistas}=require('./lib/desenhista');
    desenhista=await abrirDesenhistas({entrada:input,largura:opts.width||1080,perfil:path.join(PROFILE,'perfil.json'),quantas});
  } else {
    const prepared=await prepare(input,opts.width||1080);
    const readPlate=createPlateReader(profile,prepared.width,prepared.height);
    desenhista={largura:prepared.width,altura:prepared.height,
      desenhar:i=>readPlate(i).then(plate=>renderFrame(prepared,profile,plate,i,true)),fechar:async()=>{}};
  }
  const prepared={width:desenhista.largura,height:desenhista.altura};
  report('prepare',.08);
  const stem=opts.fileName||path.parse(input).name;
  let output=path.join(outDir,stem+'.mp4');
  const temporary=path.join(outDir,`.render-${randomUUID()}.mp4`);
  const ffmpeg=unpacked(require('ffmpeg-static'));
  // Pixels crus em vez de PNG: o PNG era comprimido aqui e descomprimido lá, a
  // cada quadro, para nada. `fast` no x264 em vez de `medium`: com CRF 17 a
  // diferença de imagem não se vê e o codificador deixa de disputar os núcleos
  // com o desenho dos quadros.
  const proc=spawn(ffmpeg,['-hide_banner','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',`${prepared.width}x${prepared.height}`,'-framerate',String(profile.fps),'-i','pipe:0','-vf','pad=ceil(iw/2)*2:ceil(ih/2)*2','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart','-an',temporary],{windowsHide:true});
  let error='';proc.stderr.on('data',b=>{error+=b.toString()});
  const finished=new Promise((resolve,reject)=>{proc.on('error',reject);proc.on('close',c=>c===0?resolve():reject(new Error('FFmpeg: '+error)));});
  finished.catch(()=>{}); // A falha é propagada no await, sem rejeição solta enquanto desenha.
  let streamError=null;proc.stdin.on('error',e=>{streamError=e});
  const abortEncoder=()=>{proc.stdin.destroy();proc.kill();};
  opts.signal?.addEventListener('abort',abortEncoder,{once:true});
  try {
    // ---- Cada pose é desenhada uma vez ----
    // Quadros vizinhos pedem poses vizinhas: a pose fica guardada enquanto algum
    // quadro à frente ainda a quiser, e as threads vão adiantando as seguintes.
    const poses=new Map();
    const pose=i=>{
      if(!poses.has(i))poses.set(i,desenhista.desenhar(i));
      return poses.get(i);
    };
    // O obturador: quanto do intervalo entre um quadro e o anterior fica
    // "exposto". 0.5 é o de cinema (180°). Onde o papel quase não se mexe, a
    // janela é estreita e o quadro sai nítido; onde a aba vira depressa, ela
    // cobre várias poses e a mistura vira rasto de movimento. É o mesmo cuidado
    // do comentário do playback — não borrar a cera à toa — só que medido.
    const obturador=suavizar?clamp(opts.obturador??0.5,0,1):0;
    const ultima=profile.frameCount-1;
    const pesosDe=k=>suavizar?pesosDoObturador(frames,k,obturador,ultima):[[frames[k],1]];
    const planos=frames.map((_,k)=>pesosDe(k));
    const ADIANTE=Math.max(3,quantas*2);
    const tamanho=prepared.width*prepared.height*3;
    for(let outputFrame=0;outputFrame<frames.length;outputFrame++) {
      checkAbort();if(streamError)throw streamError;
      // Encomenda as poses dos próximos quadros antes de esperar pelas deste.
      for(let k=outputFrame;k<Math.min(frames.length,outputFrame+ADIANTE+1);k++)for(const [i] of planos[k])pose(i);
      const plano=planos[outputFrame];
      let quadro;
      if(plano.length===1) quadro=await pose(plano[0][0]);
      else {
        const partes=await Promise.all(plano.map(([i])=>pose(i)));
        quadro=Buffer.allocUnsafe(tamanho);
        const w=plano.map(([,p])=>Math.round(p*1024));
        w[0]+=1024-w.reduce((a,b)=>a+b,0);
        // Casos de 2 e 3 poses escritos à mão: o laço genérico com um laço
        // interno por pose era um terço do tempo total (medido no profiler).
        if(partes.length===2){
          const [a,b]=partes,[wa,wb]=w;
          for(let x=0;x<tamanho;x++)quadro[x]=(a[x]*wa+b[x]*wb+512)>>10;
        } else if(partes.length===3){
          const [a,b,d]=partes,[wa,wb,wd]=w;
          for(let x=0;x<tamanho;x++)quadro[x]=(a[x]*wa+b[x]*wb+d[x]*wd+512)>>10;
        } else {
          const acc=new Uint32Array(tamanho);
          for(let q=0;q<partes.length;q++){const src=partes[q],wq=w[q];for(let x=0;x<tamanho;x++)acc[x]+=src[x]*wq;}
          for(let x=0;x<tamanho;x++)quadro[x]=(acc[x]+512)>>10;
        }
      }
      checkAbort();if(streamError)throw streamError;
      const i=Math.round(frames[outputFrame]);
      if(opts.proofDir && [0,24,48,72,96,120,144,175].includes(i)) {
        fs.mkdirSync(opts.proofDir,{recursive:true});
        fs.writeFileSync(path.join(opts.proofDir,`f${String(i).padStart(4,'0')}.png`),await sharp(quadro,{raw:{width:prepared.width,height:prepared.height,channels:3}}).png().toBuffer());
      }
      // Solta as poses que nenhum quadro daqui para a frente vai pedir.
      const menor=Math.floor(Math.min(...planos.slice(outputFrame+1,outputFrame+2+ADIANTE).flat().map(([p])=>p).concat([Infinity])));
      for(const i2 of [...poses.keys()])if(i2<menor)poses.delete(i2);
      // O codificador pode morrer enquanto Sharp compõe o quadro. Esperar só
      // 'drain' em um stream já fechado deixava a interface presa para sempre.
      await Promise.race([
        new Promise((resolve,reject)=>proc.stdin.write(quadro,e=>e?reject(e):resolve())),
        finished.then(()=>{throw new Error('O codificador encerrou antes de receber todos os quadros.');})
      ]);
      report('render',.08+.9*(outputFrame+1)/frames.length,{frame:outputFrame+1,total:frames.length});
    }
    proc.stdin.end();await finished;
    checkAbort();
    // COPYFILE_EXCL é atômico para a escolha do nome: dois trabalhos nunca substituem um MP4.
    for(let n=1;;n++) {
      output=path.join(outDir,stem+(n===1?'':` (${n})`)+'.mp4');
      try {fs.copyFileSync(temporary,output,fs.constants.COPYFILE_EXCL);break;}
      catch(e){if(e.code!=='EEXIST')throw e;}
    }
  } catch(e) {proc.stdin.destroy();proc.kill();await finished.catch(()=>{});checkAbort();throw e;}
  finally {opts.signal?.removeEventListener('abort',abortEncoder);await desenhista.fechar().catch(()=>{});if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
  report('done',1,{output});return output;
}
module.exports={prepare,renderFrame,generate,loadPlates,createPlateReader,unpacked};
