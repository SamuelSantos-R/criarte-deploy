const sharp = require('sharp');
function median(values) {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

// sRGB (D65) -> CIE Lab. A distancia euclidiana no Lab e usada apenas para
// separar materiais; a cor do papel e sempre medida na propria imagem.
function rgbToLab(r, g, b) {
  let sr = r / 255, sg = g / 255, sb = b / 255;
  const linear = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  sr = linear(sr); sg = linear(sg); sb = linear(sb);
  let x = (0.4124564*sr + 0.3575761*sg + 0.1804375*sb) / 0.95047;
  let y =  0.2126729*sr + 0.7151522*sg + 0.0721750*sb;
  let z = (0.0193339*sr + 0.1191920*sg + 0.9503041*sb) / 1.08883;
  const f = v => v > 0.008856 ? Math.cbrt(v) : 7.787*v + 16/116;
  x = f(x); y = f(y); z = f(z);
  return [116*y - 16, 500*(x - y), 200*(y - z)];
}

function labDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function robustPaperRgb(data, w, h) {
  const rs = [], gs = [], bs = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // Periferia larga: contem muito papel, mas evita a zona esperada do lacre.
    // Flores, texto e sombras sao outliers e nao deslocam a mediana.
    if (x >= w*0.18 && x <= w*0.82 && y >= h*0.18 && y <= h*0.86) continue;
    const i = (y*w + x)*3;
    rs.push(data[i]); gs.push(data[i + 1]); bs.push(data[i + 2]);
  }
  return [median(rs), median(gs), median(bs)];
}

function connectedComponents(mask, w, h, keepPixels) {
  const seen = new Uint8Array(mask.length), stack = [], out = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let area = 0, sx = 0, sy = 0, sumDistance = 0;
    let minx = w, maxx = 0, miny = h, maxy = 0;
    const pixels = keepPixels ? [] : null;
    stack.length = 0; stack.push(start); seen[start] = 1;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0;
      area++; sx += x; sy += y;
      if (pixels) pixels.push(i);
      if (mask.distances) sumDistance += mask.distances[i];
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      const neighbours = [i - 1, i + 1, i - w, i + w];
      for (const j of neighbours) {
        if (j < 0 || j >= mask.length || seen[j] || !mask[j]) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
        seen[j] = 1; stack.push(j);
      }
    }
    out.push({ area, sx, sy, minx, maxx, miny, maxy, sumDistance, pixels });
  }
  return out;
}

async function detectSeal(input) {
  const AW = 240;
  const meta = await sharp(input).metadata();
  const AH = Math.round(AW * meta.height / meta.width);
  const { data } = await sharp(input).resize(AW, AH, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = AW, h = AH, N = w * h;
  const paperRgb = robustPaperRgb(data, w, h);
  const paperLab = rgbToLab(...paperRgb);
  const threshold = 18;
  const different = new Uint8Array(N), distances = new Float32Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // O lacre fecha a ponta da aba nesta zona; limitar a busca impede que nomes,
    // flores e margens sejam promovidos a lacre.
    if (x < w*0.20 || x > w*0.80 || y < h*0.45 || y > h*0.80) continue;
    const i = y*w + x;
    const d = labDistance(rgbToLab(data[i*3], data[i*3 + 1], data[i*3 + 2]), paperLab);
    distances[i] = d;
    if (d >= threshold) different[i] = 1;
  }
  morph(different, w, h, true); morph(different, w, h, false);
  different.distances = distances;

  const minArea = w*w*0.004;
  const candidates = connectedComponents(different, w, h, false).filter(c => {
    const bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1;
    const cx = c.sx / c.area / w, cy = c.sy / c.area / h;
    const aspect = bw / bh, fill = c.area / (bw*bh);
    return c.area >= minArea && c.area <= w*w*0.13 &&
      cx >= 0.27 && cx <= 0.73 && cy >= 0.50 && cy <= 0.76 &&
      bw >= w*0.08 && bw <= w*0.42 && bh >= w*0.06 && bh <= w*0.42 &&
      aspect >= 0.45 && aspect <= 2.2 && fill >= 0.07;
  });

  for (const c of candidates) {
    const cx = c.sx / c.area / w, cy = c.sy / c.area / h;
    const centrePenalty = Math.hypot((cx - 0.5) / 0.23, (cy - 0.64) / 0.15);
    const meanDistance = c.sumDistance / c.area;
    c.score = Math.log1p(c.area) + 0.04*meanDistance - 1.4*centrePenalty;
  }
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best) {
    const largest = connectedComponents(different, w, h, false).reduce((m, c) => Math.max(m, c.area), 0);
    return { found: false, confidence: 0, paperRgb, threshold, evidenceArea: largest };
  }

  const confidence = Math.min(0.99, 0.55 + 0.12*Math.log2(best.area / minArea));
  return {
    found: true,
    confidence,
    cx: best.sx / best.area / w,
    cy: best.sy / best.area / h,
    r: ((best.maxx - best.minx + 1) + (best.maxy - best.miny + 1)) / 4 / w,
    paperRgb,
    threshold,
    evidenceArea: best.area
  };
}

// Detecta as linhas de dobra (abertura) seguindo a sombra mais escura que sai do selo.
// Retorna fracoes: apexY (ponta da aba ~ topo do selo), hingeY (onde a dobra bate na lateral), k (inclinacao).
async function detectFold(input) {
  const W = 500, meta = await sharp(input).metadata(), H = Math.round(W * meta.height / meta.width);
  const { data } = await sharp(input).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const gray = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) gray[i] = 0.299*data[i*3] + 0.587*data[i*3+1] + 0.114*data[i*3+2];
  const at = (x, y) => gray[Math.max(0,Math.min(H-1,Math.round(y)))*W + Math.max(0,Math.min(W-1,Math.round(x)))];

  const seal = await detectSeal(input);
  const cx = seal.found ? seal.cx*W : W/2;
  const sealR = seal.found ? seal.r*W : H*0.08;
  const apexY = seal.found ? seal.cy*H - sealR*0.70 : H*0.55;

  const k0 = 1.0, pts = [];   // prior ~ inclinacao real da sombra da dobra
  for (let y = apexY - sealR*0.4; y > H*0.13; y -= 2) {
    const dy = apexY - y; if (dy < 8) continue;
    const predOff = k0 * dy;
    for (const side of [-1, 1]) {
      let best = 1e9, bx = 0, sum = 0, cnt = 0;
      for (let off = predOff*0.6; off <= predOff*1.5; off += 1) {
        const x = cx + side*off; if (x<2||x>W-3) break;
        const v = at(x, y); sum += v; cnt++; if (v < best) { best = v; bx = x; }
      }
      if (cnt && (sum/cnt - best) > 7) pts.push(Math.abs(bx-cx)/dy);
    }
  }
  let k = k0;
  if (pts.length >= 6) { pts.sort((a,b)=>a-b); k = pts[Math.floor(pts.length/2)]; }
  const apexFrac = apexY / H;
  let hingeFrac = (apexY - cx / k) / H;
  hingeFrac = Math.max(apexFrac - 0.34, Math.min(apexFrac - 0.20, hingeFrac));  // mantem perto da sombra
  return { apexY: apexFrac, hingeY: hingeFrac, k };
}

async function sampleBg(input) {
  const { data, info } = await sharp(input).resize(60, 104, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height;
  const pts = [[0.05,0.5],[0.95,0.5],[0.05,0.42],[0.95,0.42],[0.5,0.04]];
  let r=0,g=0,b=0;
  for (const [fx,fy] of pts) { const i=((Math.round(fy*(h-1)))*w+Math.round(fx*(w-1)))*3; r+=data[i]; g+=data[i+1]; b+=data[i+2]; }
  const n = pts.length;
  return [Math.round(r/n), Math.round(g/n), Math.round(b/n)];
}

const durl = (buf) => 'data:image/png;base64,' + buf.toString('base64');

// ---------- morfologia / componentes / preenchimento de buracos ----------
function morph(mask, w, h, dilate) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = dilate ? 0 : 1;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      const s = (nx < 0 || ny < 0 || nx >= w || ny >= h) ? (dilate ? 0 : 1) : mask[ny * w + nx];
      if (dilate) { if (s) v = 1; } else { if (!s) v = 0; }
    }
    out[y * w + x] = v;
  }
  mask.set(out);
}
function boxBlur(a, w, h, r) {
  const tmp = new Float32Array(a.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, c = 0; for (let dx = -r; dx <= r; dx++) { const nx = x + dx; if (nx >= 0 && nx < w) { s += a[y*w+nx]; c++; } }
    tmp[y*w+x] = s / c;
  }
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    let s = 0, c = 0; for (let dy = -r; dy <= r; dy++) { const ny = y + dy; if (ny >= 0 && ny < h) { s += tmp[ny*w+x]; c++; } }
    a[y*w+x] = s / c;
  }
}
function fillHoles(mask, w, h) {
  const N = w * h, ext = new Uint8Array(N), st = [];
  const push = (i) => { if (!mask[i] && !ext[i]) { ext[i] = 1; st.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (st.length) {
    const i = st.pop(), x = i % w;
    const nb = [i - 1, i + 1, i - w, i + w];
    for (const j of nb) {
      if (j < 0 || j >= N || ext[j] || mask[j]) continue;
      if (j === i - 1 && x === 0) continue;
      if (j === i + 1 && x === w - 1) continue;
      ext[j] = 1; st.push(j);
    }
  }
  for (let i = 0; i < N; i++) if (!mask[i] && !ext[i]) mask[i] = 1;
}

// Recorte preciso do selo: usa a mesma distancia Lab ao papel medida pelo detetor,
// preenche detalhes internos e segue o contorno real da cera, seja qual for a cor.
async function segmentSeal(input, approx, bg) {
  const meta = await sharp(input).metadata();
  const W0 = meta.width, H0 = meta.height;
  const side0 = Math.round(0.55 * W0);                 // "bola central" ~ metade da pagina
  let left = Math.round(approx.cx * W0 - side0 / 2);
  let top = Math.round(approx.cy * H0 - side0 / 2);
  left = Math.max(0, Math.min(left, W0 - side0));
  top = Math.max(0, Math.min(top, H0 - side0));
  const side = Math.min(side0, W0 - left, H0 - top);
  const work = Math.min(side, 1000);
  const { data } = await sharp(input).extract({ left, top, width: side, height: side })
    .resize(work, work, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = work, h = work, N = w * h;

  const paperLab = rgbToLab(...(approx.paperRgb || bg));
  const different = new Uint8Array(N);
  // A geometria aproximada veio do componente em baixa resolucao. Usa-la aqui
  // impede que as duas linhas da dobra, que tocam no lacre, alarguem o recorte.
  const scale = side / work;
  const maxRadius = Math.max(0.12, Math.min(0.19, approx.r*1.08)) * W0 / scale;
  // Em selos pigmentados a sombra cinza da dobra não pode entrar no recorte,
  // mesmo quando toca a cera e passa a fazer parte do mesmo componente.
  const paperRgb=approx.paperRgb||bg,chromaSamples=[];
  const pigmentAt=i=>{
    const ratios=[data[i*3]/paperRgb[0],data[i*3+1]/paperRgb[1],data[i*3+2]/paperRgb[2]];
    return Math.max(...ratios)-Math.min(...ratios);
  };
  for(let y=Math.round(h*.35);y<h*.65;y+=4)for(let x=Math.round(w*.35);x<w*.65;x+=4)
    chromaSamples.push(pigmentAt(y*w+x));
  chromaSamples.sort((a,b)=>a-b);
  const coloredWax=chromaSamples[Math.floor(chromaSamples.length/2)]>.065;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x - w/2, dy = y - h/2;
    if (dx*dx + dy*dy > maxRadius*maxRadius) continue;
    const i = y*w + x;
    const d = labDistance(rgbToLab(data[i*3], data[i*3 + 1], data[i*3 + 2]), paperLab);
    if (d >= (approx.threshold || 18) && (!coloredWax||pigmentAt(i)>.04)) different[i] = 1;
  }
  morph(different, w, h, true); morph(different, w, h, false);
  morph(different, w, h, true); morph(different, w, h, false);

  const comps = connectedComponents(different, w, h, true);
  for (const c of comps) {
    const cx = c.sx/c.area, cy = c.sy/c.area;
    c.score = Math.log1p(c.area) - 3*Math.hypot((cx - w/2)/w, (cy - h/2)/h);
  }
  comps.sort((a, b) => b.score - a.score);
  const chosen = comps.find(c => c.area >= 50);
  const mask = new Uint8Array(N);
  if (chosen) for (const i of chosen.pixels) mask[i] = 1;
  fillHoles(mask, w, h);     // preenche monograma/relevo internos

  let minx = w, maxx = 0, miny = h, maxy = 0, area = 0, cxs = 0, cys = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y*w+x]) {
    area++; cxs += x; cys += y;
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  const boxArea = area ? (maxx - minx + 1)*(maxy - miny + 1) : 0;
  if (area < 50 || area / boxArea < 0.16) { // relevo da cor do papel: silhueta conservadora
    const r = Math.round(Math.max(0.12, Math.min(0.19, approx.r*1.15)) * W0 / (side/work));
    const cx = Math.round(w/2), cy = Math.round(h/2);
    for (let y=0;y<h;y++) for (let x=0;x<w;x++){ const dx=x-cx,dy=y-cy; mask[y*w+x]=(dx*dx+dy*dy<=r*r)?1:0; }
    minx=Math.max(0,cx-r); maxx=Math.min(w-1,cx+r); miny=Math.max(0,cy-r); maxy=Math.min(h-1,cy+r);
    area=0; cxs=0; cys=0;
    for (let y=miny;y<=maxy;y++) for (let x=minx;x<=maxx;x++) if (mask[y*w+x]) { area++; cxs+=x; cys+=y; }
  }
  const mg = Math.round(work * 0.015);
  minx = Math.max(0, minx - mg); miny = Math.max(0, miny - mg);
  maxx = Math.min(w - 1, maxx + mg); maxy = Math.min(h - 1, maxy + mg);
  const bw = maxx - minx + 1, bh = maxy - miny + 1;

  // alpha suavizado (box-blur em JS p/ evitar o bug de stride do sharp), depois RGBA num buffer unico
  const af = new Float32Array(N);
  for (let i = 0; i < N; i++) af[i] = mask[i] ? 255 : 0;
  boxBlur(af, w, h, 1);
  const rgba = Buffer.alloc(bw * bh * 4);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const si = (miny + y) * w + (minx + x), di = (y * bw + x) * 4;
    rgba[di] = data[si*3]; rgba[di+1] = data[si*3+1]; rgba[di+2] = data[si*3+2]; rgba[di+3] = Math.round(af[si]);
  }
  const png = await sharp(rgba, { raw: { width: bw, height: bh, channels: 4 } }).png().toBuffer();

  const cxFull = (left + (minx + bw / 2) * scale) / W0;
  const cyFull = (top + (miny + bh / 2) * scale) / H0;
  return { texSeal: durl(png), cx: cxFull, cy: cyFull, w: (bw * scale) / W0, ar: bh / bw, radiusFrac: (Math.max(bw, bh) * scale / 2) / W0 };
}


module.exports = { detectSeal, segmentSeal, detectFold, robustPaperRgb };
