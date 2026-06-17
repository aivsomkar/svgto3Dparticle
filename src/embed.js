// Generates a self-contained embed the user can drop into their own website.
// The snippet re-samples the baked SVG at runtime (small payload) and reproduces
// the live look: extruded particle volume, ambient wave, depth-only cursor
// ripple, and turntable rotation. Three.js is loaded from a CDN ESM build.

const THREE_CDN = "https://unpkg.com/three@0.171.0/build/three.module.js";

function pickSettings(config) {
  return {
    density: config.density,
    depth: config.depth,
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
};
const material = new THREE.ShaderMaterial({
  uniforms, transparent: true, depthWrite: false,
  blending: S.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  vertexShader: \`
    uniform float uIdlePhase,uIdleAmp,uIdleFreq,uCursorActive,uWaveAmp,uWaveFreq,uWaveSpeed,uCursorRadius,uSize,uPixelRatio;
    uniform vec3 uCursor; attribute vec3 aColor; attribute float aRand; varying vec3 vColor;
    void main(){ vec3 p=position;
      float idle=sin(p.x*uIdleFreq+uIdlePhase+aRand*6.2831)+sin(p.y*uIdleFreq*0.9-uIdlePhase);
      p.z+=idle*uIdleAmp*0.5;
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

function sample(){
  let text = SVG;
  if(!/\\bwidth\\s*=/.test(text)||!/\\bheight\\s*=/.test(text)){
    const vb=text.match(/viewBox\\s*=\\s*["']\\s*[\\d.+-]+\\s+[\\d.+-]+\\s+([\\d.+-]+)\\s+([\\d.+-]+)/);
    if(vb) text=text.replace(/<svg/i,'<svg width="'+Math.round(+vb[1])+'" height="'+Math.round(+vb[2])+'"');
  }
  const img=new Image(); const url=URL.createObjectURL(new Blob([text],{type:"image/svg+xml"}));
  img.onload=()=>{ URL.revokeObjectURL(url);
    let w=img.naturalWidth||512,h=img.naturalHeight||512;
    const res=360, sc=res/Math.max(w,h), cw=Math.round(w*sc), ch=Math.round(h*sc);
    const cv=document.createElement("canvas"); cv.width=cw; cv.height=ch;
    const cx=cv.getContext("2d",{willReadFrequently:true}); cx.drawImage(img,0,0,cw,ch);
    const data=cx.getImageData(0,0,cw,ch).data, norm=2/Math.max(cw,ch);
    const pos=[],col=[],rnd=[]; const keep=Math.min(1,S.density);
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){ const i=(y*cw+x)*4;
      if(data[i+3]>40 && Math.random()<=keep){
        pos.push((x-cw/2+(Math.random()-.5))*norm, -(y-ch/2+(Math.random()-.5))*norm, (Math.random()-.5)*S.depth);
        if(S.useSvgColor) col.push(data[i]/255,data[i+1]/255,data[i+2]/255);
        else { const c=new THREE.Color(S.uniformColor); col.push(c.r,c.g,c.b); }
        rnd.push(Math.random());
      }}
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
