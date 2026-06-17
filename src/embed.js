// Generates a self-contained embed the user can drop into their own website.
// The snippet re-samples the baked SVG at runtime (small payload) and reproduces
// the live look: extruded particle volume, ambient wave, depth-only cursor
// ripple, and turntable rotation. Three.js is loaded from a CDN ESM build.

const THREE_CDN = "https://unpkg.com/three@0.171.0/build/three.module.js";

function pickSettings(config) {
  return {
    density: config.density,
    depth: config.depth,
    thickness: config.thickness,
    idleMode: { radial: 0, horizontal: 1, vertical: 2, diagonal: 3 }[config.waveDir] ?? 0,
    particleSize: config.particleSize,
    opacity: config.opacity,
    additive: config.additive,
    useSvgColor: config.useSvgColor,
    uniformColor: config.uniformColor,
    background: config.background,
    transparent: config.embedTransparent ?? false,
    idleAmp: config.ambientWave ? config.idleAmp : 0,
    idleFreq: config.idleFreq,
    idleSpeed: config.idleSpeed,
    cursorWave: config.cursorWave,
    autoRotate: config.spin,
    rotateSpeed: config.rotateSpeed,
    tilt: config.tilt,
    waveAmp: config.waveAmp,
    waveFreq: config.waveFreq,
    waveSpeed: config.waveSpeed,
    cursorRadius: config.cursorRadius,
  };
}

// The runtime module, as a string, parameterized by SVG + settings placeholders.
function runtimeModule(svgText, settings) {
  return `import * as THREE from "${THREE_CDN}";

const SVG = ${JSON.stringify(svgText)};
const S = ${JSON.stringify(settings)};

const TWO_PI = Math.PI * 2;
const mount = document.getElementById("svg-particles");
const W = () => mount.clientWidth || 480;
const H = () => mount.clientHeight || 480;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(W(), H());
if (!S.transparent) renderer.setClearColor(new THREE.Color(S.background), 1);
else renderer.setClearColor(0x000000, 0);
mount.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, W() / H(), 0.1, 100);
camera.position.set(0, 0, 5);

const uniforms = {
  uIdlePhase: { value: 0 }, uIdleAmp: { value: S.idleAmp }, uIdleFreq: { value: S.idleFreq },
  uCursor: { value: new THREE.Vector3(999, 999, 0) }, uCursorActive: { value: 0 },
  uWaveAmp: { value: S.waveAmp }, uWaveFreq: { value: S.waveFreq }, uWaveSpeed: { value: 0 },
  uCursorRadius: { value: S.cursorRadius }, uSize: { value: S.particleSize },
  uPixelRatio: { value: renderer.getPixelRatio() }, uOpacity: { value: S.opacity },
  uIdleMode: { value: S.idleMode },
};
const material = new THREE.ShaderMaterial({
  uniforms, transparent: true, depthWrite: false,
  blending: S.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  vertexShader: \`
    uniform float uIdlePhase,uIdleAmp,uIdleFreq,uIdleMode,uCursorActive,uWaveAmp,uWaveFreq,uWaveSpeed,uCursorRadius,uSize,uPixelRatio;
    uniform vec3 uCursor; attribute vec3 aColor; attribute float aRand; varying vec3 vColor;
    void main(){ vec3 p=position;
      float coord;
      if(uIdleMode<0.5) coord=length(p.xy);
      else if(uIdleMode<1.5) coord=p.x;
      else if(uIdleMode<2.5) coord=p.y;
      else coord=(p.x+p.y)*0.70710678;
      p.z+=sin(coord*uIdleFreq+uIdlePhase)*uIdleAmp;
      vec2 d=p.xy-uCursor.xy; float dist=length(d);
      float fo=exp(-(dist*dist)/(uCursorRadius*uCursorRadius));
      p.z+=sin(dist*uWaveFreq-uWaveSpeed)*fo*uWaveAmp*uCursorActive;
      vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;
      gl_PointSize=uSize*uPixelRatio*(8.0/-mv.z)*(0.7+0.6*aRand); vColor=aColor; }\`,
  fragmentShader: \`
    precision highp float; uniform float uOpacity; varying vec3 vColor;
    void main(){ float r=length(gl_PointCoord-0.5); if(r>0.5)discard;
      gl_FragColor=vec4(vColor, smoothstep(0.5,0.18,r)*uOpacity); }\`,
});

const points = new THREE.Points(new THREE.BufferGeometry(), material);
points.frustumCulled = false;
scene.add(points);
const pick = new THREE.Mesh(new THREE.PlaneGeometry(1,1), new THREE.MeshBasicMaterial({visible:false, side:THREE.DoubleSide}));
points.add(pick);

function svgDims(t){
  let w,h; const vb=t.match(/viewBox\\s*=\\s*["']?\\s*([\\d.+-]+)[ ,]+([\\d.+-]+)[ ,]+([\\d.+-]+)[ ,]+([\\d.+-]+)/i);
  if(vb){ w=parseFloat(vb[3]); h=parseFloat(vb[4]); }
  if(!w||!h){ const wm=t.match(/\\bwidth\\s*=\\s*["']?\\s*([\\d.]+)/i),hm=t.match(/\\bheight\\s*=\\s*["']?\\s*([\\d.]+)/i); if(wm&&hm){w=parseFloat(wm[1]);h=parseFloat(hm[1]);} }
  if(!w||!h){ w=512; h=512; } return {w,h};
}
function distXf(data,cw,ch,th){
  const INF=1e9,D1=1,D2=1.4142,dist=new Float32Array(cw*ch);
  for(let i=0;i<cw*ch;i++) dist[i]=data[i*4+3]>th?INF:0;
  for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){const i=y*cw+x; if(!dist[i])continue; let v=dist[i];
    if(x>0)v=Math.min(v,dist[i-1]+D1); if(y>0)v=Math.min(v,dist[i-cw]+D1);
    if(x>0&&y>0)v=Math.min(v,dist[i-cw-1]+D2); if(x<cw-1&&y>0)v=Math.min(v,dist[i-cw+1]+D2); dist[i]=v;}
  for(let y=ch-1;y>=0;y--)for(let x=cw-1;x>=0;x--){const i=y*cw+x; if(!dist[i])continue; let v=dist[i];
    if(x<cw-1)v=Math.min(v,dist[i+1]+D1); if(y<ch-1)v=Math.min(v,dist[i+cw]+D1);
    if(x<cw-1&&y<ch-1)v=Math.min(v,dist[i+cw+1]+D2); if(x>0&&y<ch-1)v=Math.min(v,dist[i+cw-1]+D2); dist[i]=v;}
  return dist;
}
function sample(){
  const {w,h}=svgDims(SVG);
  const text=SVG.replace(/<svg([^>]*)>/i,(m,a)=>'<svg width="'+w+'" height="'+h+'"'+a.replace(/\\swidth\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)/i,'').replace(/\\sheight\\s*=\\s*("[^"]*"|'[^']*'|[^\\s>]+)/i,'')+'>');
  const img=new Image(); const url=URL.createObjectURL(new Blob([text],{type:"image/svg+xml"}));
  img.onload=()=>{ URL.revokeObjectURL(url);
    const res=360, sc=res/Math.max(w,h), cw=Math.round(w*sc), ch=Math.round(h*sc);
    const cv=document.createElement("canvas"); cv.width=cw; cv.height=ch;
    const cx=cv.getContext("2d",{willReadFrequently:true}); cx.drawImage(img,0,0,cw,ch);
    const data=cx.getImageData(0,0,cw,ch).data, norm=2/Math.max(cw,ch);
    const dist=distXf(data,cw,ch,40); let md=1; for(let i=0;i<dist.length;i++) if(dist[i]<1e8&&dist[i]>md) md=dist[i];
    const pos=[],col=[],rnd=[]; const keep=Math.min(1,S.density), col0=new THREE.Color(S.uniformColor);
    const put=(x,y,t)=>{ const ld=S.depth*(1-S.thickness+S.thickness*t);
      pos.push((x-cw/2+(Math.random()-.5))*norm, -(y-ch/2+(Math.random()-.5))*norm, (Math.random()-.5)*Math.max(0.04,ld));
      const i=(y*cw+x)*4; if(S.useSvgColor) col.push(data[i]/255,data[i+1]/255,data[i+2]/255); else col.push(col0.r,col0.g,col0.b);
      rnd.push(Math.random()); };
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){ const i=(y*cw+x)*4;
      if(data[i+3]<=40||Math.random()>keep) continue;
      const t=Math.min(1,dist[y*cw+x]/md); put(x,y,t);
      if(Math.random()<S.thickness*t) put(x,y,t);
    }
    const g=points.geometry;
    g.setAttribute("position",new THREE.BufferAttribute(new Float32Array(pos),3));
    g.setAttribute("aColor",new THREE.BufferAttribute(new Float32Array(col),3));
    g.setAttribute("aRand",new THREE.BufferAttribute(new Float32Array(rnd),1));
    pick.scale.set(cw*norm*1.6, ch*norm*1.6, 1);
  };
  img.src=url;
}
sample();

const ray=new THREE.Raycaster(); const ndc=new THREE.Vector2(-2,-2); let active=0;
if(S.cursorWave){
  renderer.domElement.addEventListener("pointermove",e=>{
    const r=renderer.domElement.getBoundingClientRect();
    ndc.x=((e.clientX-r.left)/r.width)*2-1; ndc.y=-((e.clientY-r.top)/r.height)*2+1;
  });
  renderer.domElement.addEventListener("pointerleave",()=>active=0);
}

let last=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  const dt=Math.min((now-last)/1000,0.05); last=now;
  uniforms.uIdlePhase.value=(uniforms.uIdlePhase.value+dt*S.idleSpeed)%TWO_PI;
  uniforms.uWaveSpeed.value+=dt*S.waveSpeed;
  if(S.cursorWave){
    ray.setFromCamera(ndc,camera);
    const hit=ray.intersectObject(pick,false);
    if(hit.length){ uniforms.uCursor.value.copy(points.worldToLocal(hit[0].point.clone())); active=1; } else active=0;
    uniforms.uCursorActive.value+=(active-uniforms.uCursorActive.value)*Math.min(1,dt*8);
  }
  if(S.autoRotate) points.rotation.y+=dt*S.rotateSpeed;
  points.rotation.x=S.tilt;
  renderer.render(scene,camera);
}
requestAnimationFrame(loop);

addEventListener("resize",()=>{
  renderer.setSize(W(),H()); camera.aspect=W()/H(); camera.updateProjectionMatrix();
});
`;
}

export function buildEmbedSnippet(svgText, config) {
  const settings = pickSettings(config);
  const bg = settings.transparent ? "transparent" : settings.background;
  return `<!-- SVG → 3D Particles embed -->
<div id="svg-particles" style="width:480px;height:480px;background:${bg}"></div>
<script type="module">
${runtimeModule(svgText, settings)}
</` + `script>`;
}

export function buildEmbedHTML(svgText, config) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SVG → 3D Particles</title>
  <style>html,body{margin:0;height:100%;background:${config.embedTransparent ? "#111" : config.background};display:grid;place-items:center}
  #svg-particles{width:min(90vw,720px);height:min(90vw,720px)}</style>
</head>
<body>
  <div id="svg-particles"></div>
  <script type="module">
${runtimeModule(svgText, pickSettings(config))}
  </` + `script>
</body>
</html>
`;
}
