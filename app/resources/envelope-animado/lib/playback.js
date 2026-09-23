// Reamostra apenas o relógio: cada quadro continua sendo uma pose original.
// Não misturar quadros evita voltar a borrar a cera e as arestas do papel.
function playbackFrames(profile,seconds,progress){
  if(!Number.isFinite(seconds)||seconds<=0)throw new Error('Duração de abertura inválida.');
  const count=Math.max(2,Math.round(seconds*profile.fps));
  if(progress){
    if(progress.length<2||progress[0]!==0||progress.at(-1)!==1||progress.some((p,i)=>!Number.isFinite(p)||p<0||p>1||(i&&p<progress[i-1])))throw new Error('Curva de velocidade inválida.');
    const y=f=>f.sealPose?.y??f.sealY;
    const start=y(profile.frames[0]),distance=start-y(profile.frames.at(-1));
    const positions=profile.frames.map(f=>(start-y(f))/distance);
    let source=0;
    return Array.from({length:count},(_,i)=>{
      if(i===0)return 0;
      if(i===count-1)return profile.frameCount-1;
      const time=i*(progress.length-1)/(count-1),a=Math.floor(time),fraction=time-a;
      const target=progress[a]*(1-fraction)+progress[Math.min(a+1,progress.length-1)]*fraction;
      while(source+1<positions.length&&Math.abs(positions[source+1]-target)<=Math.abs(positions[source]-target))source++;
      return source;
    });
  }
  return Array.from({length:count},(_,i)=>Math.round(i*(profile.frameCount-1)/(count-1)));
}
// Posição FRACIONÁRIA de cada quadro na sequência de poses. É a mesma conta do
// relógio acima, só que sem arredondar para a pose mais próxima: 41.37 quer
// dizer "37% do caminho entre a pose 41 e a 42". Quem quiser pode então
// misturar as duas vizinhas com esse peso — é o que tira o soluço do começo,
// onde três quadros repetiam a mesma pose e o quarto saltava para a seguinte.
function playbackPositions(profile,seconds,progress){
  if(!Number.isFinite(seconds)||seconds<=0)throw new Error('Duração de abertura inválida.');
  const count=Math.max(2,Math.round(seconds*profile.fps));
  const last=profile.frameCount-1;
  if(!progress)return Array.from({length:count},(_,i)=>i*last/(count-1));
  const y=f=>f.sealPose?.y??f.sealY;
  const start=y(profile.frames[0]),distance=start-y(profile.frames.at(-1));
  const positions=profile.frames.map(f=>(start-y(f))/distance);
  let source=0;
  return Array.from({length:count},(_,i)=>{
    if(i===0)return 0;
    if(i===count-1)return last;
    const time=i*(progress.length-1)/(count-1),a=Math.floor(time),fraction=time-a;
    const target=progress[a]*(1-fraction)+progress[Math.min(a+1,progress.length-1)]*fraction;
    // Anda até à última pose que ainda não passou do alvo, e interpola dali.
    while(source+1<positions.length&&positions[source+1]<=target)source++;
    if(source>=last)return last;
    const a0=positions[source],a1=positions[source+1];
    const t=a1>a0?Math.min(1,Math.max(0,(target-a0)/(a1-a0))):0;
    return source+t;
  });
}

// Que poses entram num quadro, e com que peso. O obturador diz quanto do
// intervalo desde o quadro anterior fica "exposto" (0.5 é o de cinema, 180°).
// Onde o papel quase não se mexe a janela é estreita: uma amostra só, na
// posição exata, que se reparte entre as duas poses vizinhas — é isso que tira
// o soluço. Onde a aba vira depressa a janela cobre várias poses, e a mistura
// vira rasto de movimento. Peso ínfimo não compensa desenhar a pose.
function pesosDoObturador(posicoes,k,obturador,ultima){
  const clampar=(x,a,b)=>Math.max(a,Math.min(b,x));
  const P=posicoes[k],anterior=k>0?posicoes[k-1]:P,janela=(P-anterior)*obturador;
  const n=janela<0.5?1:Math.min(6,Math.ceil(janela*2)+1);
  const pesos=new Map();
  for(let j=0;j<n;j++){
    const s=clampar(n===1?P:P-janela+janela*(j+0.5)/n,0,ultima);
    const a=Math.floor(s),t=s-a;
    pesos.set(a,(pesos.get(a)||0)+(1-t)/n);
    if(t>0&&a+1<=ultima)pesos.set(a+1,(pesos.get(a+1)||0)+t/n);
  }
  const uteis=[...pesos].filter(([,w])=>w>=0.03);
  const soma=uteis.reduce((s,[,w])=>s+w,0);
  return uteis.map(([i,w])=>[i,w/soma]);
}
module.exports={playbackFrames,playbackPositions,pesosDoObturador};

