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
module.exports={playbackFrames};
