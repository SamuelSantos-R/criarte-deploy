// Integra a cobertura de cada linha da imagem original sobre os pixels de saída.
// Letras quase de perfil conservam energia, sem saltar ao arredondar a altura.
function placePrintedBand(texture, from, to, scale, offset, opacity=1) {
  const {data,width:w,height:h}=texture;
  from=Math.max(0,texture.bounds?.top||0,from);to=Math.min(h,texture.bounds?.bottom??h,to);
  if(to<=from||scale<=0||opacity<=0)return null;
  const top=Math.floor(from*scale+offset),bottom=Math.ceil(to*scale+offset);
  const height=bottom-top,premultiplied=new Float32Array(w*height*4);
  for(let sy=Math.floor(from);sy<Math.ceil(to);sy++){
    const y0=Math.max(from,sy)*scale+offset,y1=Math.min(to,sy+1)*scale+offset;
    for(let yy=Math.floor(y0);yy<Math.ceil(y1);yy++){
      const weight=Math.max(0,Math.min(y1,yy+1)-Math.max(y0,yy))*opacity;
      if(!weight)continue;
      for(let x=0;x<w;x++){
        const src=(sy*w+x)*4,dst=((yy-top)*w+x)*4,a=data[src+3]*weight;
        premultiplied[dst]+=data[src]*a;premultiplied[dst+1]+=data[src+1]*a;
        premultiplied[dst+2]+=data[src+2]*a;premultiplied[dst+3]+=a;
      }
    }
  }
  const output=Buffer.alloc(w*height*4);
  for(let p=0;p<output.length;p+=4){
    const a=premultiplied[p+3];
    if(a>0){
      for(let c=0;c<3;c++)output[p+c]=Math.round(premultiplied[p+c]/a);
      output[p+3]=Math.min(255,Math.round(a));
    }
  }
  return {input:output,raw:{width:w,height,channels:4},left:0,top};
}

function placePrint(texture,profile,frame){
  const lines=profile.printLines,ratio=texture.height/profile.height,layers=[];
  for(let j=0;j<lines.length;j++){
    const line=lines[j],f=line.frames[frame];
    if(!f.visible)continue;
    const previous=lines[j-1],next=lines[j+1];
    const from=previous?(previous.sourceBox[1]+previous.sourceBox[3]+line.sourceBox[1])/2*ratio:0;
    const to=next?(line.sourceBox[1]+line.sourceBox[3]+next.sourceBox[1])/2*ratio:texture.height;
    const opacity=Math.min(1,f.opacity/Math.max(.01,line.frames[0].opacity));
    const offset=(f.top-line.sourceBox[1]*f.scaleY)*ratio;
    const layer=placePrintedBand(texture,from,to,f.scaleY,offset,opacity);
    if(layer)layers.push(layer);
  }
  return layers;
}
module.exports={placePrint,placePrintedBand};
