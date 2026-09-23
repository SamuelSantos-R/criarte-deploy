// Rasterização da cera original com posição subpixel e deformação medida.
// Interpolar alpha pré-multiplicado impede halos de cor do fundo transparente.
function placeSeal(texture,cx,cy,matrix=[[1,0],[0,1]]) {
  const {data,width:w,height:h}=texture;
  const [[a,b],[c,d]]=matrix,det=a*d-b*c;
  if(!Number.isFinite(det)||Math.abs(det)<.01)throw new Error('Transformação inválida do lacre.');
  const ex=(Math.abs(a)*w+Math.abs(b)*h)/2,ey=(Math.abs(c)*w+Math.abs(d)*h)/2;
  const left=Math.floor(cx-ex-1),top=Math.floor(cy-ey-1);
  const width=Math.ceil(cx+ex+1)-left,height=Math.ceil(cy+ey+1)-top;
  const output=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const dx=left+x+.5-cx,dy=top+y+.5-cy;
    const u=(d*dx-b*dy)/det+w/2-.5,v=(-c*dx+a*dy)/det+h/2-.5;
    const x0=Math.floor(u),y0=Math.floor(v),fx=u-x0,fy=v-y0;
    let alpha=0,red=0,green=0,blue=0;
    for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++){
      const sx=x0+xx,sy=y0+yy;
      if(sx<0||sx>=w||sy<0||sy>=h)continue;
      const p=(sy*w+sx)*4,weight=(xx?fx:1-fx)*(yy?fy:1-fy)*data[p+3];
      alpha+=weight;red+=data[p]*weight;green+=data[p+1]*weight;blue+=data[p+2]*weight;
    }
    if(alpha>0){const p=(y*width+x)*4;
      output[p]=Math.round(red/alpha);output[p+1]=Math.round(green/alpha);output[p+2]=Math.round(blue/alpha);output[p+3]=Math.round(alpha);
    }
  }
  return {input:output,raw:{width,height,channels:4},left,top};
}
module.exports={placeSeal};
