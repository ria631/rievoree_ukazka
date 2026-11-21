/**
 * The torn sheet (three.js). The lime page is a mesh; six petals tear along
 * jagged lines, roll up about straight creases (in the vertex shader) and throw
 * real shadows into a recess 1.8 hole-radii deep, where the repo's own source
 * lies, glowing.
 *
 * Rendered on demand, never in an idle loop: each sheet tears open once (about
 * a second), then holds still — it is redrawn only when the window resizes or
 * the code texture arrives. Scrolling the page costs the GPU nothing.
 *
 * Imperative by nature, so it lives outside React: Landing mounts it with
 * element refs and gets a disposer back. Loaded after first paint.
 */
import * as THREE from "three"
import { SRC, KEYWORDS } from "./repoSource"

const FOV = 34
const CAMZ = 10

function rng(seed: number) {
  let s = seed
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

/* ---------- textures shared by both tears: paper tooth + the source ---------- */

type Rgb = [number, number, number]

function noiseCanvas(size: number, fn: (x: number, y: number) => Rgb) {
  const c = document.createElement("canvas")
  c.width = c.height = size
  const g = c.getContext("2d")!
  const img = g.createImageData(size, size)
  for (let i = 0; i < size * size; i++) {
    const v = fn(i % size, (i / size) | 0)
    img.data[i * 4] = v[0]; img.data[i * 4 + 1] = v[1]; img.data[i * 4 + 2] = v[2]; img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
  return c
}

/** Tileable value noise on a `cells`×`cells` lattice. */
function vnoise(seed: number, cells: number) {
  const r = rng(seed)
  const g = Array.from({ length: cells * cells }, () => r())
  return (x: number, y: number) => {
    const xi = Math.floor(x) % cells, yi = Math.floor(y) % cells
    const xf = x - Math.floor(x), yf = y - Math.floor(y)
    const a = g[yi * cells + xi], b = g[yi * cells + ((xi + 1) % cells)]
    const c = g[((yi + 1) % cells) * cells + xi], d = g[((yi + 1) % cells) * cells + ((xi + 1) % cells)]
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }
}

let paperTextures: { bump: HTMLCanvasElement; map: HTMLCanvasElement } | null = null
function paperCanvases() {
  if (paperTextures) return paperTextures
  const S = 512, n1 = vnoise(3, 64), n2 = vnoise(5, 16), n3 = vnoise(9, 128), nf = vnoise(13, 32)
  const bump = noiseCanvas(S, (x, y) => {
    const t = n3((x / S) * 128, (y / S) * 128) * 0.55 + n1((x / S) * 64, (y / S) * 64) * 0.3 + n2((x / S) * 16, (y / S) * 16) * 0.15
    const fib = nf((x / S) * 32 * 0.25, (y / S) * 32) * 0.5
    const v = Math.round((t * 0.75 + fib * 0.25) * 255)
    return [v, v, v]
  })
  const map = noiseCanvas(S, (x, y) => {
    const m = (n2((x / S) * 16, (y / S) * 16) - 0.5) * 0.05 + (n1((x / S) * 64, (y / S) * 64) - 0.5) * 0.035
    return [163, 230, 53].map((c) => Math.max(0, Math.min(255, Math.round(c * (1 + m))))) as Rgb
  })
  paperTextures = { bump, map }
  return paperTextures
}

/** Two columns of real repo source, drawn once onto a 2048² canvas. */
let codeCanvas: Promise<HTMLCanvasElement> | null = null
function sourceCanvas() {
  if (codeCanvas) return codeCanvas
  codeCanvas = (async () => {
    try { await document.fonts.load('500 26px "JetBrains Mono"') } catch { /* fall back to monospace */ }
    const W = 2048
    const c = document.createElement("canvas")
    c.width = c.height = W
    const g = c.getContext("2d")!
    g.fillStyle = "#061716"
    g.fillRect(0, 0, W, W)
    g.fillStyle = "rgba(140,230,210,.035)"
    for (let y = 0; y < W; y += 4) g.fillRect(0, y, W, 1)
    const LH = 40
    const font = '500 25px "JetBrains Mono", ui-monospace, monospace'
    // Text goes onto its own layer first; the glow is that layer blurred once,
    // not a shadowBlur per glyph (thousands of those took over a second).
    const text = document.createElement("canvas")
    text.width = text.height = W
    const t = text.getContext("2d")!
    ;[[SRC.rls, SRC.worker], [SRC.report, SRC.fetch]].forEach((blocks, ci) => {
      let y = 70, ln = 1
      const x = ci ? 1080 : 56
      const all: string[] = []
      blocks.forEach((b) => { all.push(...b.split("\n"), "") })
      while (y < W - 20) {
        for (const line of all) {
          if (y > W - 20) break
          t.font = '400 21px "JetBrains Mono", monospace'
          t.fillStyle = "rgba(127,227,182,.22)"
          t.textAlign = "right"
          t.fillText(String(ln++), x + 38, y)
          t.textAlign = "left"
          let cx = x + 62
          t.font = font
          const isComment = /^\s*(--|\/\/)/.test(line)
          const toks = isComment ? [line] : line.split(/(\s+|[(),;.`]|'[^']*'|"[^"]*")/).filter(Boolean)
          const colR = x + (ci ? 940 : 990)
          for (const tok of toks) {
            const w = t.measureText(tok).width
            if (cx + w > colR) break
            t.fillStyle = isComment ? "#3F7A69" : /^['"]/.test(tok) ? "#5DCFDA" : KEYWORDS.has(tok) ? "#A3E635" : "#7FE3B6"
            t.fillText(tok, cx, y)
            cx += w
          }
          y += LH
        }
      }
    })
    g.save()
    g.filter = "blur(6px)"
    g.globalAlpha = 0.6
    g.drawImage(text, 0, 0)
    g.restore()
    g.drawImage(text, 0, 0)
    return c
  })()
  return codeCanvas
}

/* ---------- the fold: one straight crease per petal, the paper rolls about it ---------- */

const FOLD_HEAD = /* glsl */ `
attribute vec2 aAxis; attribute float aHk; attribute vec3 aRnd; attribute float aEdge; attribute float aTip;
uniform float uProg, uGrow, uTime, uScale; uniform vec2 uCenter;
varying float vEdge; varying float vTip; varying float vFold; varying vec2 vFlat;
vec3 foldPos(vec3 p, out vec3 n, out float folded){
  vec2 rel=(p.xy-uCenter)/uScale;
  float hk=aHk*uGrow, t=dot(rel,aAxis), s=hk-t;
  n=vec3(0.,0.,1.); folded=0.;
  if(s<=0.) return p;
  float pr=clamp((uProg-aRnd.x)/(1.-aRnd.x),0.,1.);
  float e=1.-pow(1.-pr,3.);
  float rho=mix(40.,aRnd.y,e);
  float amax=aRnd.z*e+(uGrow-1.)*1.4;
  float a=s/rho, inward, up;
  if(a<amax){ inward=rho*sin(a); up=rho*(1.-cos(a)); }
  else { float ex=s-rho*amax; inward=rho*sin(amax)+ex*cos(amax); up=rho*(1.-cos(amax))+ex*sin(amax); a=amax; }
  up+=.012*sin(uTime*1.4+t*7.+aRnd.x*31.)*e*min(s,1.);
  rel+=aAxis*((hk-inward)-t);
  n=vec3(aAxis*sin(a),cos(a)); folded=step(.0001,a);
  return vec3(rel*uScale+uCenter, up*uScale);
}`
const TIP_CUT = `(.15+.85*clamp(uProg*1.4,0.,1.))*uGrow`
const FRAG_HEAD = /* glsl */ `varying float vEdge; varying float vTip; varying float vFold; varying vec2 vFlat;
float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`
const CUT = /* glsl */ `if(vTip<0.) discard;
  float _ed=min(vEdge, vTip+(1.-vFold)*9.);
  float _fz=h21(floor(vFlat*900.));
  if(vFold>.5 && _ed<.006+.010*_fz) discard;`

interface Petal { ax: number; ay: number; hk: number; delay: number; rho: number; amax: number }

function petals(seed: number) {
  const r = rng(seed), N = 6, TAU = Math.PI * 2
  let w = Array.from({ length: N }, () => 0.6 + r() * 0.8)
  const sw = w.reduce((a, b) => a + b, 0)
  w = w.map((v) => (v / sw) * TAU)
  const start = r() * TAU
  const B: number[] = []
  let acc = start
  for (let i = 0; i < N; i++) { B.push(acc); acc += w[i] }
  const pet: Petal[] = B.map((b, i) => {
    const mid = b + w[i] / 2 + (r() - 0.5) * w[i] * 0.18
    return { ax: Math.cos(mid), ay: Math.sin(mid), hk: 0.92 + r() * 0.3, delay: r() * 0.3, rho: 0.13 + r() * 0.3, amax: 0.9 + r() * 2.1 }
  })
  return { N, TAU, w, B, start, pet }
}

type Uniforms = {
  uProg: { value: number }; uGrow: { value: number }; uTime: { value: number }; uScale: { value: number }; uCenter: { value: THREE.Vector2 }
}

interface Tear {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  U: Uniforms
  center: THREE.Vector2
  R: number
  depth: number
  layout: () => void
  light: (mx: number, my: number, t: number, op: number, hov: number) => void
  over: (clientX: number, clientY: number) => boolean
  /** Draw one frame at tear progress p (0 closed → 1 open). */
  draw: (p: number) => void
  dispose: () => void
}

/** One torn sheet: its own renderer, scene, lights and uniforms. */
function createTear({ canvas, host, anchor, seed, size = 0.62, mobile, reduce }: {
  canvas: HTMLCanvasElement; host: HTMLElement; anchor: HTMLElement; seed: number; size?: number; mobile: boolean; reduce: boolean
}): Tear {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" })
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const ANISO = renderer.capabilities.getMaxAnisotropy()
  const scene = new THREE.Scene()
  scene.background = new THREE.Color("#A3E635")
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100)

  const { bump, map } = paperCanvases()
  const bumpT = new THREE.CanvasTexture(bump)
  bumpT.wrapS = bumpT.wrapT = THREE.RepeatWrapping; bumpT.repeat.set(0.55, 0.55); bumpT.anisotropy = ANISO
  const mapT = new THREE.CanvasTexture(map)
  mapT.colorSpace = THREE.SRGBColorSpace; mapT.wrapS = mapT.wrapT = THREE.RepeatWrapping; mapT.repeat.set(0.12, 0.12); mapT.anisotropy = ANISO

  const U: Uniforms = { uProg: { value: 0 }, uGrow: { value: 1 }, uTime: { value: 0 }, uScale: { value: 1 }, uCenter: { value: new THREE.Vector2() } }
  type Shader = Parameters<NonNullable<THREE.Material["onBeforeCompile"]>>[0]
  function injectVertex(sh: Shader, withNormal: boolean) {
    Object.assign(sh.uniforms, U)
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + FOLD_HEAD + "\n")
    if (withNormal) sh.vertexShader = sh.vertexShader.replace("#include <beginnormal_vertex>",
      "float _f; vec3 _n; foldPos(position,_n,_f); vec3 objectNormal=_n;\n#ifdef USE_TANGENT\nvec3 objectTangent=vec3(tangent.xyz);\n#endif")
    sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>",
      `float _f2; vec3 _n2; vec3 transformed=foldPos(position,_n2,_f2);
       vEdge=aEdge; vTip=length((position.xy-uCenter)/uScale)-aTip*${TIP_CUT}; vFold=_f2; vFlat=position.xy;`)
  }
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: mapT, bumpMap: bumpT, bumpScale: 1.4, roughness: 0.93, metalness: 0, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide })
  paperMat.onBeforeCompile = (sh) => {
    injectVertex(sh, true)
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + FRAG_HEAD + "\n").replace("#include <map_fragment>", `#include <map_fragment>
    ${CUT}
    float _fib=(1.-smoothstep(0.,.045+.03*_fz,_ed))*vFold;
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.90,.97,.72),_fib*.85);
    if(!gl_FrontFacing) diffuseColor.rgb*=vec3(1.05,1.03,.93);`)
  }
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide })
  depthMat.onBeforeCompile = (sh) => {
    injectVertex(sh, false)
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + FRAG_HEAD + "\n").replace("#include <clipping_planes_fragment>", "#include <clipping_planes_fragment>\n" + CUT)
  }
  const sheetMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: mapT, bumpMap: bumpT, bumpScale: 1.4, roughness: 0.93, metalness: 0 })

  const P = petals(seed)
  /** The torn patch (a fine grid tagged per vertex with its petal) + the sheet around it. */
  function build(cx: number, cy: number, R: number) {
    const { N, TAU, w, B, start, pet } = P
    const wob = (d: number) => 0.07 * Math.sin(d * 9.3) + 0.035 * Math.sin(d * 23.1 + seed) + 0.018 * Math.sin(d * 51 + seed * 0.3)
    const tipR = (th: number) => 0.44 + 0.09 * Math.sin(3 * th + 1.3 + seed) + 0.06 * Math.sin(5 * th + 0.4) + 0.035 * Math.sin(11 * th + 2.2)
    const norm = (a: number) => ((a % TAU) + TAU) % TAU
    const sector = (th: number, d: number) => {
      const x = norm(norm(th + wob(d)) - start)
      let lo = 0
      for (let i = 0; i < N; i++) { if (x >= lo && x < lo + w[i]) return i; lo += w[i] }
      return N - 1
    }
    const angDist = (th: number, d: number, k: number) => {
      const tw = norm(th + wob(d)), lo = norm(B[k]), hi = norm(B[k] + w[k])
      const dl = Math.min(Math.abs(tw - lo), TAU - Math.abs(tw - lo)), dh = Math.min(Math.abs(tw - hi), TAU - Math.abs(tw - hi))
      return Math.min(dl, dh) * d
    }
    const H = 2.55, step = mobile ? 1 / 32 : 1 / 46, n = Math.round((2 * H) / step), tris = n * n * 2
    const pos = new Float32Array(tris * 9), uv = new Float32Array(tris * 6), aAxis = new Float32Array(tris * 6), aHk = new Float32Array(tris * 3)
    const aRnd = new Float32Array(tris * 9), aEdge = new Float32Array(tris * 3), aTip = new Float32Array(tris * 3)
    let o = 0
    const put = (vx: number, vy: number, k: number) => {
      const q = pet[k], d = Math.hypot(vx, vy), th = Math.atan2(vy, vx), wx = cx + vx * R, wy = cy + vy * R
      pos[o * 3] = wx; pos[o * 3 + 1] = wy; pos[o * 3 + 2] = 0; uv[o * 2] = wx; uv[o * 2 + 1] = wy
      aAxis[o * 2] = q.ax; aAxis[o * 2 + 1] = q.ay; aHk[o] = q.hk; aRnd[o * 3] = q.delay; aRnd[o * 3 + 1] = q.rho; aRnd[o * 3 + 2] = q.amax
      aEdge[o] = angDist(th, d, k); aTip[o] = tipR(th); o++
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x0 = -H + i * step, y0 = -H + j * step, x1 = x0 + step, y1 = y0 + step
      const tri: [number, number][][] = [[[x0, y0], [x1, y0], [x1, y1]], [[x0, y0], [x1, y1], [x0, y1]]]
      for (const T of tri) {
        const gx = (T[0][0] + T[1][0] + T[2][0]) / 3, gy = (T[0][1] + T[1][1] + T[2][1]) / 3
        const k = sector(Math.atan2(gy, gx), Math.hypot(gx, gy))
        for (const v of T) put(v[0], v[1], k)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
    g.setAttribute("aAxis", new THREE.BufferAttribute(aAxis, 2)); g.setAttribute("aHk", new THREE.BufferAttribute(aHk, 1))
    g.setAttribute("aRnd", new THREE.BufferAttribute(aRnd, 3)); g.setAttribute("aEdge", new THREE.BufferAttribute(aEdge, 1)); g.setAttribute("aTip", new THREE.BufferAttribute(aTip, 1))
    g.computeVertexNormals()
    const m = new THREE.Mesh(g, paperMat)
    m.customDepthMaterial = depthMat; m.castShadow = m.receiveShadow = true; m.frustumCulled = false
    const shape = new THREE.Shape()
    shape.moveTo(-60, -40); shape.lineTo(60, -40); shape.lineTo(60, 40); shape.lineTo(-60, 40); shape.closePath()
    const hole = new THREE.Path(), h = H * R
    hole.moveTo(cx - h, cy - h); hole.lineTo(cx - h, cy + h); hole.lineTo(cx + h, cy + h); hole.lineTo(cx + h, cy - h); hole.closePath()
    shape.holes.push(hole)
    const s = new THREE.Mesh(new THREE.ShapeGeometry(shape), sheetMat)
    s.receiveShadow = s.castShadow = true
    return { m, s }
  }

  scene.add(new THREE.AmbientLight(0xffffff, 1.25))
  const key = new THREE.DirectionalLight(0xfffbe8, 2.2)
  key.castShadow = true
  key.shadow.mapSize.set(mobile ? 1024 : 1536, mobile ? 1024 : 1536)
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4
  scene.add(key, key.target)
  const glow = new THREE.PointLight(0x2fe0a8, 0, 0, 1.6)
  scene.add(glow)

  let tear: { m: THREE.Mesh; s: THREE.Mesh } | null = null
  let code: THREE.Mesh | null = null
  let codeT: THREE.CanvasTexture | null = null
  let disposed = false

  const T: Tear = {
    renderer, scene, camera, U, center: new THREE.Vector2(), R: 1, depth: 1,
    layout: () => {},
    light: () => {},
    over: () => false,
    draw: () => {},
    dispose: () => {},
  }
  const worldAtZ0 = (px: number, py: number) => {
    const v = new THREE.Vector3((px / host.clientWidth) * 2 - 1, -(py / host.clientHeight) * 2 + 1, 0.5).unproject(camera)
    const dir = v.sub(camera.position).normalize()
    return camera.position.clone().add(dir.multiplyScalar(-camera.position.z / dir.z))
  }
  T.layout = () => {
    if (disposed) return
    const w = host.clientWidth, h = host.clientHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.position.set(0, 0, CAMZ); camera.lookAt(0, 0, 0); camera.fov = FOV
    camera.updateProjectionMatrix(); camera.updateMatrixWorld()
    const r = anchor.getBoundingClientRect(), hr = host.getBoundingClientRect()
    const cy = r.top - hr.top + r.height / 2
    const c = worldAtZ0(r.left - hr.left + r.width / 2, cy), e = worldAtZ0(r.right - hr.left, cy)
    T.center.set(c.x, c.y)
    T.R = Math.abs(e.x - c.x) * size
    U.uCenter.value.copy(T.center); U.uScale.value = T.R
    if (tear) { scene.remove(tear.m, tear.s); tear.m.geometry.dispose(); tear.s.geometry.dispose() }
    tear = build(c.x, c.y, T.R)
    scene.add(tear.m, tear.s)
    T.depth = 1.8 * T.R
    if (code) { scene.remove(code); code.geometry.dispose(); (code.material as THREE.Material).dispose() }
    if (codeT) {
      const span = 60
      codeT.repeat.set(span / 6.4, span / 6.4)
      code = new THREE.Mesh(new THREE.PlaneGeometry(span, span),
        new THREE.MeshStandardMaterial({ map: codeT, emissiveMap: codeT, emissive: 0xffffff, emissiveIntensity: 0.62, roughness: 0.85, metalness: 0 }))
      code.position.set(c.x, c.y, -T.depth)
      code.receiveShadow = true
      scene.add(code)
    }
    const sc = key.shadow.camera
    sc.left = sc.bottom = -4.2 * T.R; sc.right = sc.top = 4.2 * T.R; sc.near = 0.1; sc.far = 20 * T.R
    sc.updateProjectionMatrix()
    key.target.position.set(c.x, c.y, -T.depth * 0.5)
    glow.position.set(c.x, c.y - 0.2 * T.R, -0.55 * T.depth)
    glow.distance = 5 * T.R
  }
  T.light = (mx, my, t, op, hov) => {
    key.position.set(T.center.x - 3.2 * T.R + mx * 2.4 * T.R, T.center.y + 4.2 * T.R - my * 1.6 * T.R, 7.5 * T.R)
    glow.intensity = (reduce ? 7 : 6 + 1.6 * Math.sin(t * 1.1)) * T.R * T.R * (0.25 + op * 0.75) + hov * 3 * T.R * T.R
  }
  // Is a screen point over the hole?
  T.over = (clientX, clientY) => {
    const v = new THREE.Vector3(T.center.x, T.center.y, 0).project(camera), hr = host.getBoundingClientRect()
    const hx = hr.left + ((v.x + 1) / 2) * hr.width, hy = hr.top + ((1 - v.y) / 2) * hr.height
    const rpx = (T.R / (2 * CAMZ * Math.tan((FOV * Math.PI) / 360))) * hr.height
    return Math.hypot(clientX - hx, clientY - hy) < rpx * 0.9
  }
  let lastP = 0
  T.draw = (p: number) => {
    if (disposed) return
    lastP = p
    U.uProg.value = p
    U.uGrow.value = 1
    U.uTime.value = 0
    camera.position.set(0, 0, CAMZ)
    camera.lookAt(0, 0, 0)
    T.light(0, 0, 0, p, 0)
    renderer.render(scene, camera)
  }
  T.dispose = () => {
    disposed = true
    if (tear) { tear.m.geometry.dispose(); tear.s.geometry.dispose() }
    if (code) { code.geometry.dispose(); (code.material as THREE.Material).dispose() }
    codeT?.dispose(); bumpT.dispose(); mapT.dispose()
    paperMat.dispose(); depthMat.dispose(); sheetMat.dispose()
    renderer.dispose()
  }
  void sourceCanvas().then((c) => {
    if (disposed) return
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO
    codeT = t
    T.layout()
    T.draw(lastP)
  })
  T.layout()
  return T
}

export interface LandingEls {
  hero: HTMLElement      // the first screen
  stage: HTMLElement     // the canvas host inside it
  canvas: HTMLCanvasElement
  anchor: HTMLElement    // where the hole sits
  hint: HTMLElement      // cursor hint over the hole
  bar: HTMLElement       // the fixed header
  close: HTMLElement     // the closing section
  canvas2: HTMLCanvasElement
  anchor2: HTMLElement
  hint2: HTMLElement
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
// Start the tear part-way: the first fifth is hairline cracks, which read as
// noise at this size. Then about a second to fully open.
const P0 = 0.22
const OPEN_MS = 1100

/**
 * Tear a sheet open once, then stop. Returns a cancel function.
 * Adaptive: if a frame takes too long to draw (a weak GPU), the animation is
 * skipped and the sheet is drawn open — one frame, not a second of stutter.
 */
function openOnce(T: Tear, reduce: boolean, onFirstFrame: () => void): () => void {
  if (reduce) { T.draw(1); onFirstFrame(); return () => {} }
  let raf = 0
  let t0 = 0
  let frames = 0
  const step = (now: number) => {
    if (!t0) { t0 = now; T.draw(P0); onFirstFrame() } // first frame may compile shaders: not timed
    const k = Math.min(1, (now - t0) / OPEN_MS)
    const s0 = performance.now()
    T.draw(P0 + (1 - P0) * easeOut(k))
    const slow = ++frames > 1 && performance.now() - s0 > 45
    if (slow) { T.draw(1); return }
    if (k < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}

/**
 * Mount both tears, the hover hint and the header colour. Returns a disposer.
 * Throws if WebGL is unavailable — the caller falls back to the flat page.
 */
export function mountLanding(els: LandingEls, onOpenDemo: () => void): () => void {
  const mobile = matchMedia("(max-width: 980px)").matches
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
  const hero = createTear({ canvas: els.canvas, host: els.stage, anchor: els.anchor, seed: 1234, size: 0.58, mobile, reduce })
  const cancels: (() => void)[] = []
  cancels.push(openOnce(hero, reduce, () => els.canvas.classList.add("on")))

  // The closing sheet is built only when it's needed: while the browser is
  // idle after the hero opened, or as the visitor scrolls within ~a screen of
  // it — whichever comes first. Building it and drawing its first (invisible)
  // frame compiles the shaders, so the tear later never stalls a scroll.
  let close: Tear | null = null
  let closeFailed = false
  let closeOpened = false
  const ensureClose = () => {
    if (!close && !closeFailed) {
      try {
        close = createTear({ canvas: els.canvas2, host: els.close, anchor: els.anchor2, seed: 77, size: 0.56, mobile, reduce })
        close.draw(P0)
      } catch { closeFailed = true }
    }
    return close
  }
  const idle = (cb: () => void) => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(cb, { timeout: 5000 })
    else setTimeout(cb, 1800)
  }
  const warm = window.setTimeout(() => idle(() => { ensureClose() }), OPEN_MS + 600)
  cancels.push(() => clearTimeout(warm))
  const near = new IntersectionObserver((es) => { if (es[0].isIntersecting) ensureClose() }, { rootMargin: "0px 0px 100% 0px" })
  near.observe(els.close)
  const io = new IntersectionObserver((es) => {
    if (!es[0].isIntersecting || closeOpened) return
    const c = ensureClose()
    if (!c) return
    closeOpened = true
    cancels.push(openOnce(c, reduce, () => els.canvas2.classList.add("on")))
  }, { threshold: 0.3 })
  io.observe(els.close)

  // Hover: a hint and a pointer over the hole (geometry only — no redraw).
  let overHero = false, overClose = false
  const onMove = (e: PointerEvent) => {
    const hr = els.hero.getBoundingClientRect()
    overHero = e.clientY > hr.top && e.clientY < hr.bottom && hero.over(e.clientX, e.clientY)
    els.hint.style.opacity = overHero ? "1" : "0"
    els.hint.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`
    els.stage.style.cursor = overHero ? "pointer" : ""
    const cr = els.close.getBoundingClientRect()
    overClose = !!close && closeOpened && e.clientY > cr.top && e.clientY < cr.bottom && close.over(e.clientX, e.clientY)
    els.hint2.style.opacity = overClose ? "1" : "0"
    els.hint2.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`
    els.canvas2.style.cursor = overClose ? "pointer" : ""
  }
  const onHeroClick = () => {
    if (overHero) document.getElementById("layers")?.scrollIntoView({ behavior: reduce ? "auto" : "smooth" })
  }
  const onCloseClick = () => { if (overClose) onOpenDemo() }

  // Header: ink on the paper, light over the machinery.
  const onScroll = () => {
    const pastHero = els.hero.getBoundingClientRect().bottom <= 64
    const onClose = els.close.getBoundingClientRect().top <= 64
    els.bar.classList.toggle("is-dark", pastHero && !onClose)
    els.bar.classList.toggle("is-paper", onClose)
  }

  // Resize: re-lay the sheets out, redraw each once at its current state.
  let rt = 0
  const onResize = () => {
    clearTimeout(rt)
    rt = window.setTimeout(() => {
      hero.layout(); hero.draw(1)
      if (close) { close.layout(); close.draw(closeOpened ? 1 : P0) }
    }, 150)
  }

  addEventListener("pointermove", onMove, { passive: true })
  addEventListener("scroll", onScroll, { passive: true })
  addEventListener("resize", onResize)
  els.stage.addEventListener("click", onHeroClick)
  els.canvas2.addEventListener("click", onCloseClick)
  onScroll()

  return () => {
    cancels.forEach((c) => c())
    clearTimeout(rt)
    io.disconnect()
    near.disconnect()
    removeEventListener("pointermove", onMove)
    removeEventListener("scroll", onScroll)
    removeEventListener("resize", onResize)
    els.stage.removeEventListener("click", onHeroClick)
    els.canvas2.removeEventListener("click", onCloseClick)
    hero.dispose()
    close?.dispose()
  }
}
