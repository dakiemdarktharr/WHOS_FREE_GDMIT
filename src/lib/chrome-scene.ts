import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type ChromeScene = { refresh: () => void; setPaused: (paused: boolean) => void; dispose: () => void };
type Callbacks = { background: () => void; title: () => void; failed: () => void };

const fragmentShader = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uMap0,uMap1,uMap2,uMap3,uMap4,uMap5,uMap6;
uniform float uRatios[7],uCrops[7],uAspect,uTime;
vec3 surface(float index,vec2 st){
  int i=int(index);
  float aspect=uRatios[i]*uCrops[i];
  vec2 fit=vec2(min(1.,uAspect/aspect),min(1.,aspect/uAspect));
  vec2 uv=(st-.5)*fit*.86+.5;
  uv.x=(uv.x-.5)*uCrops[i]+.5;
  uv=clamp(uv,.001,.999);
  vec3 value=vec3(0.);
  if(index<.5)value=texture2D(uMap0,uv).rgb;
  else if(index<1.5)value=texture2D(uMap1,uv).rgb;
  else if(index<2.5)value=texture2D(uMap2,uv).rgb;
  else if(index<3.5)value=texture2D(uMap3,uv).rgb;
  else if(index<4.5)value=texture2D(uMap4,uv).rgb;
  else if(index<5.5)value=texture2D(uMap5,uv).rgb;
  else value=texture2D(uMap6,uv).rgb;
  return value;
}
float waveField(vec2 p,float t){
  vec2 q=p*1.7;
  q+=vec2(sin(q.y*1.45-t*.31),sin(q.x*1.35+t*.27))*.68;
  return sin(q.x*1.85+q.y*.65-t*.82)+.64*sin(q.y*2.35-q.x*.75+t*.51)+.26*cos(length(q+vec2(.3,.2))*2.6-t*.42);
}
void main(){
  float t=uTime*.9;
  vec2 p=(vUv-.5)*vec2(uAspect,1.);
  float height=waveField(p,t);
  vec2 slope=vec2(waveField(p+vec2(.015,0.),t)-height,waveField(p+vec2(0.,.015),t)-height)/.015;
  vec2 st=vUv+slope*.018;
  st+=vec2(sin(height*1.8+t*.23),cos(height*1.4-t*.19))*.023;
  float design=mod(height*1.7+t*.16+14.,7.);
  float first=floor(design);
  float blend=smoothstep(.1,.9,fract(design));
  vec3 color=mix(surface(first,st),surface(mod(first+1.,7.),st),blend);
  gl_FragColor=vec4(color*(.93+.07*cos(height*1.7)),1.);
}`;

function disposeObject(object: THREE.Object3D) {
  object.traverse(child => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
    }
  });
}

export function createChromeScene(canvas: HTMLCanvasElement, callbacks: Callbacks): ChromeScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  const mobile = matchMedia("(pointer: coarse)").matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.autoClear = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, .1, 150);
  const backgroundScene = new THREE.Scene();
  const backgroundCamera = new THREE.Camera();
  const textures: THREE.Texture[] = [];
  const uniforms = {
    uMap0: { value: null as THREE.Texture | null }, uMap1: { value: null as THREE.Texture | null },
    uMap2: { value: null as THREE.Texture | null }, uMap3: { value: null as THREE.Texture | null },
    uMap4: { value: null as THREE.Texture | null }, uMap5: { value: null as THREE.Texture | null },
    uMap6: { value: null as THREE.Texture | null },
    uRatios: { value: [1, 1, 1, 1, 1, 1, 1] }, uCrops: { value: [.89, .83, 1, 1, 1, 1, .955] },
    uAspect: { value: innerWidth / innerHeight }, uTime: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({ uniforms, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: "varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}", fragmentShader });
  backgroundScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));

  let disposed = false, broken = false, paused = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ready = false, dirty = true, loadingModel = false, time = 0, frame = 0, last = performance.now();
  let model: THREE.Group | null = null;
  let environmentMap: THREE.WebGLRenderTarget | null = null;
  let heroRect: DOMRect | null = null;
  let titleStarted = 0;
  const size = new THREE.Vector3(11.5, 3.1, .69);
  const pointer = new THREE.Vector2();
  const projectedCenter = new THREE.Vector3();
  const halfFov = THREE.MathUtils.degToRad(17);

  function fit() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    camera.position.set(0, 0, Math.max(size.x / (2 * Math.tan(halfFov) * camera.aspect * .8), size.y / (2 * Math.tan(halfFov) * .72)) + size.z / 2);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    dirty = true;
  }

  async function loadModel() {
    if (loadingModel || model || disposed) return;
    loadingModel = true;
    try {
      const loaded = await new GLTFLoader().loadAsync("/models/whos-free-solid-chrome.glb");
      if (disposed || broken) { disposeObject(loaded.scene); return; }
      model = loaded.scene;
      new THREE.Box3().setFromObject(model).getSize(size);
      scene.add(model);
      const studio = new THREE.Scene();
      studio.background = new THREE.Color(0x111722);
      const panels = [
        [0, 7, 7, 18, 4, 0xffffff, 4], [-7, 1, 5, 2, 9, 0xeafaff, 3], [7, -2, 4, 1.5, 7, 0xd8cfff, 3],
        [0, 1.5, 8, 16, 1.9, 0xffffff, 5], [0, -4, 8, 12, .7, 0xffffff, 4], [0, 1, -8, 16, 5, 0xffffff, 3],
      ];
      for (const [x, y, z, width, height, color, intensity] of panels) {
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
        panel.position.set(x, y, z); panel.lookAt(0, 0, 0); studio.add(panel);
      }
      const pmrem = new THREE.PMREMGenerator(renderer);
      environmentMap = pmrem.fromScene(studio, .025);
      scene.environment = environmentMap.texture;
      scene.environmentIntensity = 1.1;
      disposeObject(studio); pmrem.dispose();
      const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(-4, 6, 8); scene.add(key);
      const rim = new THREE.DirectionalLight(0xcfeeff, 2); rim.position.set(6, -1, -5); scene.add(rim);
      model.traverse(child => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) child.material.envMapIntensity = 1.1;
      });
      titleStarted = performance.now();
      fit(); refresh();
      callbacks.title();
    } catch { /* Keep the accessible CSS title if the GLB cannot be loaded. */ }
  }

  function refresh() {
    heroRect = document.querySelector(".landing-hero")?.getBoundingClientRect() ?? null;
    if (heroRect && ready) void loadModel();
    dirty = true;
  }
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    uniforms.uAspect.value = innerWidth / innerHeight;
    fit(); refresh();
  }
  function move(event: PointerEvent) {
    if (!model || paused || event.pointerType === "touch" || !heroRect || heroRect.bottom <= 0) return;
    model.getWorldPosition(projectedCenter).project(camera);
    const centerX = (projectedCenter.x * .5 + .5) * innerWidth;
    const centerY = (-projectedCenter.y * .5 + .5) * innerHeight;
    pointer.set(THREE.MathUtils.clamp((event.clientX - centerX) / (innerWidth * .4), -1, 1), THREE.MathUtils.clamp((event.clientY - centerY) / (innerHeight * .4), -1, 1));
    dirty = true;
  }
  function resetPointer() { pointer.set(0, 0); dirty = true; }
  function visibility() { last = performance.now(); dirty = true; }
  function contextLost(event: Event) { event.preventDefault(); broken = true; callbacks.failed(); }

  window.addEventListener("resize", resize);
  window.addEventListener("scroll", refresh, { passive: true });
  window.addEventListener("pointermove", move, { passive: true });
  document.documentElement.addEventListener("pointerleave", resetPointer);
  document.addEventListener("visibilitychange", visibility);
  canvas.addEventListener("webglcontextlost", contextLost);
  resize();

  const loader = new THREE.TextureLoader();
  const loads = Array.from({ length: 7 }, (_, index) => new Promise<void>((resolve, reject) => {
    const texture = loader.load(`/textures/waves/reference-${index + 1}.png`, loaded => {
      if (disposed || broken) { loaded.dispose(); resolve(); return; }
      loaded.minFilter = THREE.LinearFilter; loaded.magFilter = THREE.LinearFilter;
      uniforms[`uMap${index}` as "uMap0"].value = loaded;
      uniforms.uRatios.value[index] = loaded.image.width / loaded.image.height;
      resolve();
    }, undefined, reject);
    textures.push(texture);
  }));
  void Promise.all(loads).then(() => {
    if (disposed || broken) return;
    ready = true; dirty = true;
    callbacks.background(); refresh();
  }).catch(() => { broken = true; callbacks.failed(); });

  function animate(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    if (!ready || broken || document.hidden) { last = now; return; }
    const elapsed = now - last;
    if (elapsed < (mobile ? 32 : 15) || (paused && !dirty)) return;
    const delta = Math.min(elapsed / 1000, .05); last = now;
    if (!paused) time += delta;
    uniforms.uTime.value = time;
    scene.environmentRotation.y = time * .055;
    if (model) {
      model.visible = !!heroRect && heroRect.bottom > 0 && heroRect.top < innerHeight;
      if (heroRect && model.visible) {
        const centerY = heroRect.top + heroRect.height * .5;
        model.position.y = (.5 - centerY / innerHeight) * 2 * Math.tan(halfFov) * camera.position.z;
        const progress = paused ? 1 : Math.min(1, (now - titleStarted) / 650);
        model.scale.setScalar(.92 + .08 * (1 - Math.pow(1 - progress, 3)));
        model.rotation.x = paused ? 0 : THREE.MathUtils.damp(model.rotation.x, pointer.y * .35, 28, delta);
        model.rotation.y = paused ? 0 : THREE.MathUtils.damp(model.rotation.y, pointer.x * .58, 28, delta);
      }
    }
    renderer.clear(); renderer.render(backgroundScene, backgroundCamera);
    renderer.clearDepth(); renderer.render(scene, camera);
    dirty = false;
  }
  frame = requestAnimationFrame(animate);
  return {
    refresh,
    setPaused(value) { paused = value; resetPointer(); },
    dispose() {
      disposed = true; cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize); window.removeEventListener("scroll", refresh); window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", resetPointer); document.removeEventListener("visibilitychange", visibility);
      canvas.removeEventListener("webglcontextlost", contextLost);
      textures.forEach(texture => texture.dispose());
      disposeObject(scene); disposeObject(backgroundScene); environmentMap?.dispose(); renderer.dispose();
    },
  };
}
