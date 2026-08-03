import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SatStore } from '../lib/data';
import { CATEGORY_COLOR } from '../lib/types';
import type { CategoryId } from '../lib/types';
import { sunDirection, latLonToVec3 } from '../lib/astro';
import type { OrbitWorkerClient, SnapshotBuffers } from '../lib/orbitWorker';

const EARTH_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const EARTH_FRAGMENT = /* glsl */ `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform vec3 sunDir;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  vec3 day = texture2D(dayMap, vUv).rgb;
  vec3 night = texture2D(nightMap, vUv).rgb;
  vec3 n = normalize(vNormal);
  vec3 s = normalize((viewMatrix * vec4(sunDir, 0.0)).xyz);
  float d = dot(n, s);
  float mixv = smoothstep(-0.08, 0.25, d);
  vec3 nightLit = night * 1.6 * vec3(1.0, 0.95, 0.8);
  vec3 col = mix(nightLit, day, mixv);
  float glow = (1.0 - abs(d)) * 0.06;
  col += vec3(0.9, 0.5, 0.25) * glow;
  gl_FragColor = vec4(col, 1.0);
}
`;

const ATMOS_VERTEX = /* glsl */ `
varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const ATMOS_FRAGMENT = /* glsl */ `
varying vec3 vNormal;
void main() {
  float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.5);
  gl_FragColor = vec4(0.35, 0.6, 1.0, 1.0) * intensity;
}
`;

const SAT_VERTEX = /* glsl */ `
attribute float size;
attribute vec3 customColor;
attribute float alpha;
varying vec3 vColor;
varying float vAlpha;
// 1 = cameră perspectivă (glob), 0 = ortografică (hartă plată)
uniform float perspective;
uniform float orthoScale;
void main() {
  vColor = customColor;
  vAlpha = alpha;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  if (perspective > 0.5) {
    // plafon generos: la apropiere maximă pictograma trebuie să crească vizibil,
    // altfel „zoom-ul" pe un obiect se oprește într-un punct de 30 px
    gl_PointSize = min(size * (5.0 / -mvPosition.z), 160.0);
  } else {
    // pe hartă nu există adâncime: mărimea vine din zoom
    gl_PointSize = clamp(size * orthoScale, 2.0, 26.0);
  }
  gl_Position = projectionMatrix * mvPosition;
}
`;

/** Harta plată: 2:1, echirectangulară, ca orice hartă a lumii */
const MAP_W = 4;
const MAP_H = 2;

/**
 * Ziua și noaptea pe harta plată. Aceeași matematică de terminator ca pe glob,
 * doar că normala se reconstruiește din coordonatele texturii.
 */
const MAP_FRAGMENT = /* glsl */ `
uniform sampler2D dayMap;
uniform sampler2D nightMap;
uniform vec3 sunDir;
varying vec2 vUv;
void main() {
  vec3 day = texture2D(dayMap, vUv).rgb;
  vec3 night = texture2D(nightMap, vUv).rgb;
  float lon = (vUv.x - 0.5) * 360.0;
  float lat = (vUv.y - 0.5) * 180.0;
  float phi = radians(90.0 - lat);
  float theta = radians(lon + 180.0);
  vec3 n = vec3(-sin(phi) * cos(theta), cos(phi), sin(phi) * sin(theta));
  float d = dot(n, normalize(sunDir));
  float mixv = smoothstep(-0.10, 0.18, d);
  vec3 nightLit = night * 1.5 * vec3(1.0, 0.95, 0.8);
  gl_FragColor = vec4(mix(nightLit, day, mixv), 1.0);
}
`;

const MAP_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** Poziția pe harta plată a unui punct dat prin latitudine/longitudine */
function latLonToMap(latDeg: number, lonDeg: number, out: THREE.Vector3, z = 0.01): THREE.Vector3 {
  return out.set((lonDeg / 180) * (MAP_W / 2), (latDeg / 90) * (MAP_H / 2), z);
}

const SAT_FRAGMENT = /* glsl */ `
uniform sampler2D map;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 tex = texture2D(map, gl_PointCoord);
  if (tex.a * vAlpha < 0.02) discard;
  gl_FragColor = vec4(vColor * tex.rgb + tex.rgb * 0.25, tex.a * vAlpha);
}
`;

/**
 * Limitele de zoom ale OrbitControls sunt măsurate față de ȚINTĂ, nu față de
 * centrul Pământului. Când ținta e globul, 1,05 raze înseamnă „nu intra în
 * planetă". Când ținta devine un satelit, aceeași valoare ar împinge camera la
 * ~6.700 km de el — de aici smucitura de la selecție.
 */
const EARTH_MIN_DIST = 1.05;
/** ~5 km de obiect: destul de aproape încât modelul lui să umple cadrul */
const SAT_MIN_DIST = 0.0008;
/** Distanța de încadrare a unui satelit selectat (~1.900 km) */
const SAT_VIEW_DIST = 0.3;
/** Sub această distanță (~320 km) înlocuim punctul cu un model 3D */
const MODEL_SHOW_DIST = 0.05;

const EARTH_RADIUS_KM = 6371;

/**
 * Raza cercului de vizibilitate al unui satelit, în radiani de unghi central.
 * Un observator vede satelitul deasupra elevației `elevDeg` doar în interiorul
 * acestui cerc — de aici „amprenta" lui pe Pământ.
 */
export function footprintAngleRad(altKm: number, elevDeg = 0): number {
  const e = (elevDeg * Math.PI) / 180;
  const ratio = (EARTH_RADIUS_KM / (EARTH_RADIUS_KM + Math.max(altKm, 1))) * Math.cos(e);
  return Math.acos(Math.min(1, Math.max(-1, ratio))) - e;
}

/** Raza amprentei la sol, în kilometri de-a lungul suprafeței */
export const footprintRadiusKm = (altKm: number, elevDeg = 0) =>
  footprintAngleRad(altKm, elevDeg) * EARTH_RADIUS_KM;

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Pictogramă de satelit desenată procedural (corp + panouri solare + strălucire) */
function makeSatelliteTexture(): THREE.Texture {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = S;
  cv.height = S;
  const ctx = cv.getContext('2d')!;

  // glow
  const g = ctx.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  ctx.translate(S / 2, S / 2);
  // panouri solare (stânga/dreapta) — gri-albăstrui, nuanțate de culoarea categoriei
  ctx.fillStyle = 'rgba(210,225,255,0.95)';
  ctx.fillRect(-46, -7, 26, 14);
  ctx.fillRect(20, -7, 26, 14);
  ctx.strokeStyle = 'rgba(90,110,160,0.9)';
  ctx.lineWidth = 1.5;
  for (const x0 of [-46, 20]) {
    ctx.strokeRect(x0, -7, 26, 14);
    ctx.beginPath();
    ctx.moveTo(x0 + 8.7, -7); ctx.lineTo(x0 + 8.7, 7);
    ctx.moveTo(x0 + 17.3, -7); ctx.lineTo(x0 + 17.3, 7);
    ctx.stroke();
  }
  // brațe
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(-20, -1.5, 40, 3);
  // corp
  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.fillRect(-10, -8, 20, 16);
  ctx.strokeStyle = 'rgba(120,135,175,0.9)';
  ctx.strokeRect(-10, -8, 20, 16);
  // antenă
  ctx.beginPath();
  ctx.arc(0, 12, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fill();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class GlobeEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private container: HTMLElement;

  private earth!: THREE.Mesh;
  private earthMat!: THREE.ShaderMaterial;
  private satPoints!: THREE.Points;
  private satMat!: THREE.ShaderMaterial;
  private satGeo!: THREE.BufferGeometry;
  private store: SatStore | null = null;

  private streaks!: THREE.LineSegments;
  private streakGeo!: THREE.BufferGeometry;
  private showStreaks = true;

  private orbitLine: THREE.Line | null = null;
  private groundLine: THREE.Line | null = null;
  private groundDot: THREE.Mesh | null = null;
  private marker!: THREE.Mesh;

  // --- modul hartă plată ---
  private mapMode = false;
  private mapCamera!: THREE.OrthographicCamera;
  private mapControls!: OrbitControls;
  private mapGroup = new THREE.Group();
  private mapPlane!: THREE.Mesh;
  private mapMat!: THREE.ShaderMaterial;
  private mapPoints: THREE.Points | null = null;
  private mapGeo: THREE.BufferGeometry | null = null;
  private mapPos: Float32Array = new Float32Array(0);
  private mapTrack: THREE.LineSegments | null = null;
  private mapMarker!: THREE.Mesh;
  private mapObserver: THREE.Mesh | null = null;
  private globeGroup = new THREE.Group();

  private selectedIndex: number | null = null;
  private tracking = false;
  private visibleCategories = new Set<CategoryId>();
  private highlightSet: Set<number> | null = null;
  private shellMesh: THREE.Mesh | null = null;
  private observerMarker: THREE.Mesh | null = null;

  // --- interpolare poziții (mișcare lină, propagare reală SGP4) ---
  private renderPos: Float32Array = new Float32Array(0);
  private prevPos: Float32Array = new Float32Array(0);
  private snapPos: Float32Array = new Float32Array(0);
  private velDir: Float32Array = new Float32Array(0); // direcție + viteză per satelit
  private t0 = 0; // sim-ms pentru prevPos
  private t1 = 0; // sim-ms pentru snapPos
  private hasSnap = false;

  private disposed = false;
  private lastOrbitRebuild = 0;

  /** firul de calcul; dacă lipsește, propagăm sincron (mod degradat) */
  private worker: OrbitWorkerClient | null = null;
  /** câte milisecunde de timp simulat trec pe milisecundă reală */
  private simRate = 1;
  private lastRealMs = 0;
  private lastSimMs = 0;
  private lastRequestedSimMs = Number.NaN;

  // --- animație cameră ---
  private camAnim: {
    t0: number;
    dur: number;
    /** direcția cameră→țintă la începutul mișcării, normalizată */
    fromDir: THREE.Vector3;
    fromDist: number;
    fromTgt: THREE.Vector3;
    /** satelitul urmărit; se recalculează în fiecare cadru pentru că se mișcă */
    index: number | null;
    staticTgt: THREE.Vector3;
    /** ținta e un obiect în orbită → încadrăm radial, dinspre exterior */
    radial: boolean;
    toDist: number;
    /** unghiul total de parcurs, radiani — dictează cât de sus se ridică arcul */
    angle: number;
  } | null = null;

  private tmpV = new THREE.Vector3();
  private tmpTgt = new THREE.Vector3();
  private tmpTgt2 = new THREE.Vector3();
  private tmpDir = new THREE.Vector3();
  private tmpDir2 = new THREE.Vector3();
  private tmpDelta = new THREE.Vector3();
  private tmpQ = new THREE.Quaternion();
  private tmpQ2 = new THREE.Quaternion();
  private sun = new THREE.Vector3(1, 0, 0);

  onPick: ((index: number | null) => void) | null = null;
  /** Obiectul de sub cursor, cu poziția lui pe ecran — pentru tooltip */
  onHover: ((hit: { index: number; x: number; y: number } | null) => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.001,
      500
    );
    this.camera.position.set(0, 0.6, 3.2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 1.05;
    this.controls.maxDistance = 60;
    this.controls.rotateSpeed = 0.5;

    this.buildScene();
    window.addEventListener('resize', this.handleResize);
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.handleClick);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerLeave);
  }

  /** Harta plată: același Pământ, aceleași date, altă proiecție */
  private buildMapScene(dayTex: THREE.Texture, nightTex: THREE.Texture) {
    this.mapMat = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: dayTex },
        nightMap: { value: nightTex },
        sunDir: { value: this.sun },
      },
      vertexShader: MAP_VERTEX,
      fragmentShader: MAP_FRAGMENT,
    });
    this.mapPlane = new THREE.Mesh(new THREE.PlaneGeometry(MAP_W, MAP_H, 128, 64), this.mapMat);
    this.mapGroup.add(this.mapPlane);

    const g = new THREE.RingGeometry(0.012, 0.02, 32);
    const m = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    this.mapMarker = new THREE.Mesh(g, m);
    this.mapMarker.visible = false;
    this.mapMarker.renderOrder = 10;
    this.mapGroup.add(this.mapMarker);

    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    const aspect = w / h;
    const viewH = Math.max(MAP_H, MAP_W / aspect);
    this.mapCamera = new THREE.OrthographicCamera(
      (-viewH * aspect) / 2, (viewH * aspect) / 2, viewH / 2, -viewH / 2, 0.1, 100
    );
    this.mapCamera.position.set(0, 0, 10);

    this.mapControls = new OrbitControls(this.mapCamera, this.renderer.domElement);
    this.mapControls.enableRotate = false;
    this.mapControls.screenSpacePanning = true;
    this.mapControls.enableDamping = true;
    this.mapControls.dampingFactor = 0.12;
    this.mapControls.minZoom = 0.9;
    this.mapControls.maxZoom = 60;
    this.mapControls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.mapControls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
    this.mapControls.enabled = false;

    this.mapGroup.visible = false;
    this.scene.add(this.mapGroup);
  }

  /** Comută între globul 3D și harta plată */
  setViewMode(mode: 'globe' | 'map') {
    const wantMap = mode === 'map';
    if (wantMap === this.mapMode) return;
    this.mapMode = wantMap;
    this.endCamAnim();

    this.globeGroup.visible = !wantMap;
    this.mapGroup.visible = wantMap;
    this.controls.enabled = !wantMap;
    this.mapControls.enabled = wantMap;
    this.satMat.uniforms.perspective.value = wantMap ? 0 : 1;

    if (wantMap) {
      this.ensureMapPoints();
      // harta se deschide pe toată lumea — asta e vederea utilă, ca la FlightRadar24;
      // apropierea se face doar dacă utilizatorul cere explicit un obiect
      if (this.selectedIndex !== null && this.store?.valid[this.selectedIndex]) {
        this.centerMapOn(this.selectedIndex);
      } else {
        this.mapControls.target.set(0, 0, 0);
        this.mapCamera.position.set(0, 0, 10);
      }
      this.mapCamera.zoom = 1;
      this.mapCamera.updateProjectionMatrix();
      this.rebuildMapTrack();
    } else {
      this.lastOrbitRebuild = 0; // forțăm reconstruirea traseului 3D
    }
  }

  getViewMode(): 'globe' | 'map' {
    return this.mapMode ? 'map' : 'globe';
  }

  private ensureMapPoints() {
    if (!this.store || this.mapPoints) return;
    const n = this.store.size;
    this.mapPos = new Float32Array(n * 3);
    this.mapGeo = new THREE.BufferGeometry();
    this.mapGeo.setAttribute('position', new THREE.BufferAttribute(this.mapPos, 3));
    // culorile, mărimile și transparențele sunt exact aceleași obiecte ca pe glob:
    // un singur refreshAlphas actualizează ambele vederi
    this.mapGeo.setAttribute('customColor', this.satGeo.getAttribute('customColor'));
    this.mapGeo.setAttribute('size', this.satGeo.getAttribute('size'));
    this.mapGeo.setAttribute('alpha', this.satGeo.getAttribute('alpha'));
    this.mapPoints = new THREE.Points(this.mapGeo, this.satMat);
    this.mapPoints.frustumCulled = false;
    this.mapGroup.add(this.mapPoints);
  }

  /**
   * Centrează harta pe un obiect.
   * `zoomIn` doar la focalizare explicită — la urmărirea continuă schimbarea de
   * zoom ar fi amețitoare. `smooth` glisează în loc să sară, mai puțin la
   * trecerea peste antimeridian, unde o glisare ar traversa toată harta invers.
   */
  private centerMapOn(index: number, zoomIn = false, smooth = false) {
    if (!this.store) return;
    const p = latLonToMap(this.store.geoLat[index], this.store.geoLon[index], this.tmpV, 0);
    const t = this.mapControls.target;
    const wrapped = Math.abs(p.x - t.x) > MAP_W / 2;
    const k = smooth && !wrapped ? 0.15 : 1;
    const nx = t.x + (p.x - t.x) * k;
    const ny = t.y + (p.y - t.y) * k;
    t.set(nx, ny, 0);
    this.mapCamera.position.set(nx, ny, 10);
    if (zoomIn) {
      this.mapCamera.zoom = Math.max(this.mapCamera.zoom, 4);
      this.mapCamera.updateProjectionMatrix();
    }
  }

  /** Reproiectează pozițiile 3D interpolate pe harta plată */
  private updateMapPositions() {
    if (!this.store || !this.mapGeo) return;
    const n = this.store.size;
    const src = this.hasSnap ? this.renderPos : this.store.positions;
    const out = this.mapPos;
    for (let i = 0; i < n; i++) {
      const x = src[i * 3];
      const y = src[i * 3 + 1];
      const z = src[i * 3 + 2];
      const r = Math.sqrt(x * x + y * y + z * z);
      if (r < 1e-6 || !this.store.valid[i]) {
        out[i * 3] = 0;
        out[i * 3 + 1] = 0;
        out[i * 3 + 2] = -5; // în spatele hărții = invizibil
        continue;
      }
      const lat = 90 - (Math.acos(Math.min(1, Math.max(-1, y / r))) * 180) / Math.PI;
      const lon = (Math.atan2(z, -x) * 180) / Math.PI - 180;
      out[i * 3] = ((((lon + 180) % 360) + 360) % 360 - 180) / 180 * (MAP_W / 2);
      out[i * 3 + 1] = (lat / 90) * (MAP_H / 2);
      // obiectele mai înalte stau deasupra celor joase, ca să nu se acopere aiurea
      out[i * 3 + 2] = 0.01 + Math.min(this.store.geoAlt[i], 40000) / 4e6;
    }
    (this.mapGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  private disposeMapTrack() {
    if (!this.mapTrack) return;
    this.mapGroup.remove(this.mapTrack);
    this.mapTrack.geometry.dispose();
    (this.mapTrack.material as THREE.Material).dispose();
    this.mapTrack = null;
  }

  /**
   * Traseul pe hartă. Segmentat, nu continuu: la trecerea peste meridianul 180°
   * longitudinea sare de la +180 la −180, iar o linie continuă ar tăia harta
   * dintr-o margine în alta.
   */
  private rebuildMapTrack(simTime = new Date()) {
    this.disposeMapTrack();
    if (!this.store || this.selectedIndex === null || !this.mapMode) return;

    const { positions, nowAt } = this.store.groundTrack(this.selectedIndex, simTime);
    const count = positions.length / 3;
    const base = new THREE.Color(CATEGORY_COLOR[this.store.entries[this.selectedIndex].category]);

    const lat: number[] = [];
    const lon: number[] = [];
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      const r = Math.sqrt(x * x + y * y + z * z) || 1;
      lat.push(90 - (Math.acos(Math.min(1, Math.max(-1, y / r))) * 180) / Math.PI);
      let lo = (Math.atan2(z, -x) * 180) / Math.PI - 180;
      lo = ((((lo + 180) % 360) + 360) % 360) - 180;
      lon.push(lo);
    }

    const verts: number[] = [];
    const cols: number[] = [];
    const shade = (i: number) =>
      i <= nowAt
        ? nowAt === 0 ? 0.25 : 0.06 + 0.34 * (i / nowAt)
        : 1 - 0.55 * ((i - nowAt) / Math.max(1, count - 1 - nowAt));

    for (let i = 0; i < count - 1; i++) {
      if (Math.abs(lon[i + 1] - lon[i]) > 180) continue; // saltul peste antimeridian
      for (const j of [i, i + 1]) {
        verts.push((lon[j] / 180) * (MAP_W / 2), (lat[j] / 90) * (MAP_H / 2), 0.004);
        const k = shade(j);
        cols.push(base.r * k, base.g * k, base.b * k);
      }
    }
    if (verts.length === 0) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.mapTrack = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.mapTrack.frustumCulled = false;
    this.mapGroup.add(this.mapTrack);
  }

  private buildScene() {
    this.scene.background = new THREE.Color(0x02030a);
    this.scene.add(this.globeGroup);

    // --- stele ---
    const starCount = 3500;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(120 + Math.random() * 180);
      starPos.set([v.x, v.y, v.z], i * 3);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.5,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    this.globeGroup.add(new THREE.Points(starGeo, starMat));

    // --- Pământ ---
    const loader = new THREE.TextureLoader();
    const dayTex = loader.load('assets/earth-day.jpg');
    dayTex.colorSpace = THREE.SRGBColorSpace;
    const nightTex = loader.load('assets/earth-night.jpg');
    nightTex.colorSpace = THREE.SRGBColorSpace;

    this.earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayMap: { value: dayTex },
        nightMap: { value: nightTex },
        sunDir: { value: this.sun },
      },
      vertexShader: EARTH_VERTEX,
      fragmentShader: EARTH_FRAGMENT,
    });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), this.earthMat);
    this.globeGroup.add(this.earth);

    // --- atmosferă ---
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: ATMOS_VERTEX,
      fragmentShader: ATMOS_FRAGMENT,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const atmos = new THREE.Mesh(new THREE.SphereGeometry(1.045, 64, 64), atmosMat);
    this.globeGroup.add(atmos);

    // --- marker selecție ---
    const markerGeo = new THREE.RingGeometry(0.012, 0.02, 32);
    const markerMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    });
    this.marker = new THREE.Mesh(markerGeo, markerMat);
    this.marker.visible = false;
    this.marker.renderOrder = 10;
    this.globeGroup.add(this.marker);

    this.buildMapScene(dayTex, nightTex);
  }

  setStore(store: SatStore) {
    this.store = store;
    if (this.satPoints) {
      this.globeGroup.remove(this.satPoints);
      this.satGeo.dispose();
      this.satMat.dispose();
    }
    // catalog nou = alt număr de obiecte; proiecția pe hartă se reconstruiește
    if (this.mapPoints) {
      this.mapGroup.remove(this.mapPoints);
      this.mapGeo?.dispose();
      this.mapPoints = null;
      this.mapGeo = null;
    }
    this.disposeMapTrack();
    const n = store.size;
    this.renderPos = new Float32Array(n * 3);
    this.prevPos = new Float32Array(n * 3);
    this.snapPos = new Float32Array(n * 3);
    this.velDir = new Float32Array(n * 4); // xyz direcție, w = lungime streak
    this.hasSnap = false;

    const colors = new Float32Array(n * 3);
    const sizes = new Float32Array(n);
    const alphas = new Float32Array(n).fill(0.95);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      col.set(CATEGORY_COLOR[store.entries[i].category]);
      colors.set([col.r, col.g, col.b], i * 3);
      sizes[i] = store.entries[i].category === 'station' ? 9 : store.entries[i].category === 'starlink' ? 4.6 : 6.2;
    }
    this.satGeo = new THREE.BufferGeometry();
    this.satGeo.setAttribute('position', new THREE.BufferAttribute(this.renderPos, 3));
    this.satGeo.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
    this.satGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    this.satGeo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

    this.satMat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: makeSatelliteTexture() },
        perspective: { value: this.mapMode ? 0 : 1 },
        orthoScale: { value: 1 },
      },
      vertexShader: SAT_VERTEX,
      fragmentShader: SAT_FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.satPoints = new THREE.Points(this.satGeo, this.satMat);
    this.satPoints.frustumCulled = false;
    this.globeGroup.add(this.satPoints);

    // --- dâre de mișcare (streaks pe direcția orbitei) ---
    const sp = new Float32Array(n * 6);
    const sc = new Float32Array(n * 6);
    this.streakGeo = new THREE.BufferGeometry();
    this.streakGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.streakGeo.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    const streakMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.streaks = new THREE.LineSegments(this.streakGeo, streakMat);
    this.streaks.frustumCulled = false;
    this.globeGroup.add(this.streaks);
    this.refreshStreakColors();

    if (this.mapMode) this.ensureMapPoints();
  }

  setWorker(worker: OrbitWorkerClient | null) {
    this.worker = worker;
  }

  /**
   * Preia o poziționare completă calculată în worker.
   * Ținem două instantanee consecutive și interpolăm între ele — de aici vine
   * mișcarea continuă, deși propagarea reală se face de câteva ori pe secundă.
   */
  applySnapshot(timeMs: number, b: SnapshotBuffers) {
    const store = this.store;
    if (!store || this.disposed) return;
    const n = store.size;
    if (b.positions.length < n * 3) return;

    store.positions.set(b.positions.subarray(0, n * 3));
    store.geoLat.set(b.geoLat.subarray(0, n));
    store.geoLon.set(b.geoLon.subarray(0, n));
    store.geoAlt.set(b.geoAlt.subarray(0, n));
    store.valid.set(b.valid.subarray(0, n));

    if (!this.hasSnap) {
      this.snapPos.set(store.positions);
      this.prevPos.set(store.positions);
      this.t0 = timeMs;
      this.t1 = timeMs;
      this.hasSnap = true;
      return;
    }

    // timpul stă pe loc (pauză): actualizăm ținta fără a rescrie istoricul
    if (timeMs <= this.t1 + 1) {
      this.snapPos.set(store.positions);
      return;
    }

    this.prevPos.set(this.snapPos);
    this.t0 = this.t1;
    this.snapPos.set(store.positions);
    this.t1 = timeMs;

    const dt = Math.max(this.t1 - this.t0, 1);
    for (let i = 0; i < n; i++) {
      const dx = this.snapPos[i * 3] - this.prevPos[i * 3];
      const dy = this.snapPos[i * 3 + 1] - this.prevPos[i * 3 + 1];
      const dz = this.snapPos[i * 3 + 2] - this.prevPos[i * 3 + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len > 1e-9) {
        this.velDir[i * 4] = dx / len;
        this.velDir[i * 4 + 1] = dy / len;
        this.velDir[i * 4 + 2] = dz / len;
        // viteza (unități/ms simulat) → lungimea dârei, plafonată ca să nu devină bandă
        this.velDir[i * 4 + 3] = Math.min((len / dt) * 8000, 0.06);
      } else {
        this.velDir[i * 4 + 3] = 0;
      }
    }
  }

  setStreaksVisible(v: boolean) {
    this.showStreaks = v;
    if (this.streaks) this.streaks.visible = v;
  }

  setVisibleCategories(cats: Set<CategoryId>) {
    this.visibleCategories = new Set(cats);
    this.refreshAlphas();
  }

  setHighlightSet(indices: Set<number> | null) {
    this.highlightSet = indices;
    this.refreshAlphas();
  }

  showShell(altKm: number | null) {
    if (this.shellMesh) {
      this.globeGroup.remove(this.shellMesh);
      this.shellMesh.geometry.dispose();
      (this.shellMesh.material as THREE.Material).dispose();
      this.shellMesh = null;
    }
    if (altKm !== null) {
      const r = 1 + altKm / 6371;
      const geo = new THREE.SphereGeometry(r, 64, 48);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x38e1ff,
        transparent: true,
        opacity: 0.07,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.shellMesh = new THREE.Mesh(geo, mat);
      this.shellMesh.renderOrder = 2;
      this.globeGroup.add(this.shellMesh);
    }
  }

  showObserver(latDeg: number | null, lonDeg = 0) {
    if (this.observerMarker) {
      this.globeGroup.remove(this.observerMarker);
      this.observerMarker.geometry.dispose();
      (this.observerMarker.material as THREE.Material).dispose();
      this.observerMarker = null;
    }
    if (this.mapObserver) {
      this.mapGroup.remove(this.mapObserver);
      this.mapObserver.geometry.dispose();
      (this.mapObserver.material as THREE.Material).dispose();
      this.mapObserver = null;
    }
    if (latDeg !== null) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x00ff9d });
      this.observerMarker = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 16), mat.clone());
      latLonToVec3(latDeg, lonDeg, 1.004, this.observerMarker.position);
      this.globeGroup.add(this.observerMarker);

      this.mapObserver = new THREE.Mesh(new THREE.CircleGeometry(0.012, 20), mat);
      latLonToMap(latDeg, lonDeg, this.mapObserver.position, 0.03);
      this.mapGroup.add(this.mapObserver);
    }
  }

  private refreshAlphas() {
    if (!this.store) return;
    const attr = this.satGeo.getAttribute('alpha') as THREE.BufferAttribute;
    for (let i = 0; i < this.store.size; i++) {
      const e = this.store.entries[i];
      let a = this.visibleCategories.has(e.category) ? 0.95 : 0.0;
      if (a > 0 && this.highlightSet) {
        a = this.highlightSet.has(i) ? 1.0 : 0.05;
      }
      attr.setX(i, a);
    }
    attr.needsUpdate = true;
    this.refreshStreakColors();
  }

  private refreshStreakColors() {
    if (!this.store || !this.streakGeo) return;
    const attr = this.streakGeo.getAttribute('color') as THREE.BufferAttribute;
    const col = new THREE.Color();
    for (let i = 0; i < this.store.size; i++) {
      const e = this.store.entries[i];
      const vis = this.visibleCategories.has(e.category);
      let bright = 0.85;
      if (vis && this.highlightSet) {
        bright = this.highlightSet.has(i) ? 1.0 : 0.05;
      }
      if (!vis) bright = 0;
      col.set(CATEGORY_COLOR[e.category]).multiplyScalar(bright);
      // capătul din spate (coada) este întunecat → fade cu blending aditiv
      attr.setXYZ(i * 2, col.r * 0.05, col.g * 0.05, col.b * 0.05);
      attr.setXYZ(i * 2 + 1, col.r, col.g, col.b);
    }
    attr.needsUpdate = true;
  }

  select(index: number | null) {
    const had = this.selectedIndex !== null;
    // restaurăm dimensiunea precedentului selectat
    if (this.selectedIndex !== null && this.store) {
      const sizeAttr = this.satGeo.getAttribute('size') as THREE.BufferAttribute;
      const cat = this.store.entries[this.selectedIndex].category;
      sizeAttr.setX(this.selectedIndex, cat === 'station' ? 9 : cat === 'starlink' ? 4.6 : 6.2);
      sizeAttr.needsUpdate = true;
    }
    this.selectedIndex = index;
    if (index === null) {
      this.marker.visible = false;
      this.tracking = false;
      if (this.orbitLine) {
        this.globeGroup.remove(this.orbitLine);
        this.orbitLine.geometry.dispose();
        (this.orbitLine.material as THREE.Material).dispose();
        this.orbitLine = null;
      }
      this.disposeGroundTrack();
      this.disposeMapTrack();
      if (this.mapMarker) this.mapMarker.visible = false;
      // ne întoarcem la glob doar dacă chiar veneam de la un obiect selectat
      if (had && !this.mapMode) this.focusHome();
    } else if (this.store) {
      // satelitul selectat e mai mare
      const sizeAttr = this.satGeo.getAttribute('size') as THREE.BufferAttribute;
      sizeAttr.setX(index, 14);
      sizeAttr.needsUpdate = true;
      this.lastOrbitRebuild = 0; // forțăm reconstruirea orbitei
    }
  }

  setTracking(on: boolean) {
    this.tracking = on && this.selectedIndex !== null;
  }

  getTracking() {
    return this.tracking;
  }

  private disposeGroundTrack() {
    if (this.groundLine) {
      this.globeGroup.remove(this.groundLine);
      this.groundLine.geometry.dispose();
      (this.groundLine.material as THREE.Material).dispose();
      this.groundLine = null;
    }
    if (this.groundDot) {
      this.globeGroup.remove(this.groundDot);
      this.groundDot.geometry.dispose();
      (this.groundDot.material as THREE.Material).dispose();
      this.groundDot = null;
    }
  }

  /**
   * Urma la sol a obiectului selectat. Trecutul se stinge, viitorul e aprins —
   * ca la traseul unui avion în FlightRadar24.
   */
  private rebuildGroundTrack(simTime: Date) {
    if (!this.store || this.selectedIndex === null) return;
    this.disposeGroundTrack();

    const { positions, nowAt } = this.store.groundTrack(this.selectedIndex, simTime);
    const count = positions.length / 3;
    const colors = new Float32Array(count * 3);
    const base = new THREE.Color(CATEGORY_COLOR[this.store.entries[this.selectedIndex].category]);

    for (let i = 0; i < count; i++) {
      let k: number;
      if (i <= nowAt) {
        // trecut: se stinge cu cât e mai vechi
        k = nowAt === 0 ? 0.25 : 0.06 + 0.34 * (i / nowAt);
      } else {
        // viitor: pornește aprins și scade lent spre orizontul de predicție
        k = 1 - 0.55 * ((i - nowAt) / Math.max(1, count - 1 - nowAt));
      }
      colors[i * 3] = base.r * k;
      colors[i * 3 + 1] = base.g * k;
      colors[i * 3 + 2] = base.b * k;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.groundLine = new THREE.Line(geo, mat);
    this.groundLine.frustumCulled = false;
    this.globeGroup.add(this.groundLine);

    // punctul de sub satelit, chiar acum
    const dotGeo = new THREE.SphereGeometry(0.006, 12, 12);
    const dotMat = new THREE.MeshBasicMaterial({ color: base, transparent: true, opacity: 0.95 });
    this.groundDot = new THREE.Mesh(dotGeo, dotMat);
    this.groundDot.position.set(positions[nowAt * 3], positions[nowAt * 3 + 1], positions[nowAt * 3 + 2]);
    this.globeGroup.add(this.groundDot);
  }

  private rebuildOrbitLine(simTime: Date) {
    if (!this.store || this.selectedIndex === null) return;
    if (this.orbitLine) {
      this.globeGroup.remove(this.orbitLine);
      this.orbitLine.geometry.dispose();
      (this.orbitLine.material as THREE.Material).dispose();
    }
    const pts = this.store.orbitPath(this.selectedIndex, simTime);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const mat = new THREE.LineBasicMaterial({
      color: CATEGORY_COLOR[this.store.entries[this.selectedIndex].category],
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.orbitLine = new THREE.Line(geo, mat);
    this.orbitLine.frustumCulled = false;
    this.globeGroup.add(this.orbitLine);
  }

  /** Actualizare per-frame; simTime = timpul simulat */
  update(simTime: Date, forceFull = false) {
    if (this.disposed) return;
    sunDirection(simTime, this.sun);
    const simMs = simTime.getTime();

    if (this.store && this.satPoints) {
      const n = this.store.size;

      // estimăm cât de repede curge timpul simulat, ca să cerem poziții pentru
      // momentul în care răspunsul chiar va sosi — altfel am fi mereu în urmă
      const realNow = performance.now();
      if (this.lastRealMs > 0) {
        const dReal = realNow - this.lastRealMs;
        if (dReal > 0.5) {
          const rate = (simMs - this.lastSimMs) / dReal;
          this.simRate = this.simRate * 0.85 + rate * 0.15;
        }
      }
      this.lastRealMs = realNow;
      this.lastSimMs = simMs;

      if (this.worker) {
        const lead = Math.max(0, this.worker.latencyMs * this.simRate);
        const target = simMs + lead;
        // pe pauză nu are rost să recalculăm aceeași poziție la infinit
        if (!this.hasSnap || Math.abs(target - this.lastRequestedSimMs) > 50) {
          this.lastRequestedSimMs = target;
          this.worker.requestSnapshot(target);
        }
      } else if (forceFull || !this.hasSnap) {
        // mod degradat: fără worker, propagăm sincron
        this.store.propagateRange(simTime, 0, n, 0);
        this.snapPos.set(this.store.positions);
        this.prevPos.set(this.store.positions);
        this.t0 = simMs;
        this.t1 = simMs;
        this.hasSnap = true;
      }

      // interpolare lină între snapshot-uri (extrapolăm ușor peste t1)
      if (this.hasSnap) {
        const span = Math.max(this.t1 - this.t0, 1e-6);
        const alpha = Math.min(Math.max((simMs - this.t0) / span, 0), 1.35);
        const rp = this.renderPos;
        const pp = this.prevPos;
        const sp = this.snapPos;
        for (let i = 0; i < n * 3; i++) {
          rp[i] = pp[i] + (sp[i] - pp[i]) * alpha;
        }
        (this.satGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

        // actualizare streaks
        if (this.showStreaks) {
          const sAttr = this.streakGeo.getAttribute('position') as THREE.BufferAttribute;
          const arr = sAttr.array as Float32Array;
          for (let i = 0; i < n; i++) {
            const L = this.velDir[i * 4 + 3];
            arr[i * 6] = rp[i * 3] - this.velDir[i * 4] * L;
            arr[i * 6 + 1] = rp[i * 3 + 1] - this.velDir[i * 4 + 1] * L;
            arr[i * 6 + 2] = rp[i * 3 + 2] - this.velDir[i * 4 + 2] * L;
            arr[i * 6 + 3] = rp[i * 3];
            arr[i * 6 + 4] = rp[i * 3 + 1];
            arr[i * 6 + 5] = rp[i * 3 + 2];
          }
          sAttr.needsUpdate = true;
        }
      }

      if (this.mapMode) {
        this.updateMapPositions();
        if (this.selectedIndex !== null && this.store.valid[this.selectedIndex]) {
          latLonToMap(
            this.store.geoLat[this.selectedIndex],
            this.store.geoLon[this.selectedIndex],
            this.mapMarker.position,
            0.02
          );
          this.mapMarker.visible = true;
          this.mapMarker.scale.setScalar(1.6 / this.mapCamera.zoom);
          if (!this.mapTrack || performance.now() - this.lastOrbitRebuild > 3000) {
            this.rebuildMapTrack(simTime);
            this.lastOrbitRebuild = performance.now();
          }
          if (this.tracking) this.centerMapOn(this.selectedIndex, false, true);
        } else {
          this.mapMarker.visible = false;
        }
        this.satMat.uniforms.orthoScale.value = 0.55 + this.mapCamera.zoom * 0.22;
        this.mapControls.update();
        this.renderer.render(this.scene, this.mapCamera);
        return;
      }

      // marker + tracking
      if (this.selectedIndex !== null && this.store.valid[this.selectedIndex]) {
        const p = this.hasSnap ? this.renderPos : this.store.positions;
        this.tmpV.set(
          p[this.selectedIndex * 3],
          p[this.selectedIndex * 3 + 1],
          p[this.selectedIndex * 3 + 2]
        );
        this.marker.visible = true;
        this.marker.position.copy(this.tmpV);
        this.marker.lookAt(this.camera.position);
        const scale = this.camera.position.distanceTo(this.tmpV) * 0.9;
        this.marker.scale.setScalar(scale);

        if (this.tracking && !this.camAnim) {
          if (this.controls.target.distanceTo(this.tmpV) > 0.5) {
            // ținta e departe (satelit schimbat, salt în timp): un lerp liniar ar
            // târî camera pe o coardă prin interiorul planetei. Zburăm pe arc.
            this.focusOn(this.selectedIndex);
          } else {
            // camera se deplasează ODATĂ cu ținta. Dacă mutăm doar ținta,
            // OrbitControls păstrează poziția camerei și doar reorientează —
            // satelitul iese din cadru în câteva secunde, la 7,6 km/s.
            this.tmpDelta.copy(this.controls.target);
            this.controls.target.lerp(this.tmpV, 0.12);
            this.tmpDelta.subVectors(this.controls.target, this.tmpDelta);
            this.camera.position.add(this.tmpDelta);
          }
        }
        if (!this.orbitLine || performance.now() - this.lastOrbitRebuild > 3000) {
          this.rebuildOrbitLine(simTime);
          this.rebuildGroundTrack(simTime);
          this.lastOrbitRebuild = performance.now();
        }
        // punctul de la sol urmărește satelitul între reconstrucții
        if (this.groundDot) {
          this.groundDot.position.copy(this.tmpV).setLength(1.004);
        }
      } else {
        this.marker.visible = false;
      }
    }

    if (this.camAnim) {
      const a = this.camAnim;
      const e = easeInOutCubic(Math.min((performance.now() - a.t0) / a.dur, 1));

      // ținta se recalculează în fiecare cadru: satelitul nu ne așteaptă
      const live = this.liveTarget(this.tmpTgt, a);

      // Ținta se deplasează tot pe arc, nu în linie dreaptă. Între doi sateliți
      // diametral opuși, o interpolare liniară trece exact prin centrul planetei
      // și trage camera după ea, prin interiorul Pământului.
      const tgt = this.tmpTgt2;
      const rFrom = a.fromTgt.length();
      const rTo = live.length();
      if (rFrom > 1e-6 && rTo > 1e-6) {
        this.tmpDir.copy(a.fromTgt).divideScalar(rFrom);
        this.tmpDir2.copy(live).divideScalar(rTo);
        this.tmpQ.setFromUnitVectors(this.tmpDir, this.tmpDir2);
        this.tmpQ2.identity().slerp(this.tmpQ, e);
        tgt.copy(this.tmpDir).applyQuaternion(this.tmpQ2).multiplyScalar(rFrom + (rTo - rFrom) * e);
      } else {
        tgt.lerpVectors(a.fromTgt, live, e);
      }

      const toDir = a.radial ? this.tmpDir.copy(live).normalize() : this.tmpDir.copy(a.fromDir);

      // camera se rotește pe arc în jurul țintei
      this.tmpQ.setFromUnitVectors(a.fromDir, toDir);
      this.tmpQ2.identity().slerp(this.tmpQ, e);
      const dir = this.tmpDir2.copy(a.fromDir).applyQuaternion(this.tmpQ2);

      const dist = a.fromDist + (a.toDist - a.fromDist) * e;
      this.controls.target.copy(tgt);
      this.camera.position.copy(tgt).addScaledVector(dir, dist);

      // La mijlocul drumului ridicăm camera RADIAL, dinspre centrul planetei —
      // proporțional cu ocolul de făcut. Ridicarea pe direcția camerei ar putea
      // împinge exact spre interior, când direcția ajunge să arate în jos.
      const arc = Math.sin(Math.PI * e) * (a.angle / Math.PI) * 1.4;
      const r = this.camera.position.length();
      const rWanted = Math.max(r + arc, 1.08); // plasă de siguranță: nu intrăm în planetă
      if (r > 1e-6) this.camera.position.multiplyScalar(rWanted / r);

      this.camera.lookAt(tgt);

      if (performance.now() - a.t0 >= a.dur) this.endCamAnim();
    } else {
      // OrbitControls își recalculează poziția din propria stare sferică; dacă îl
      // lăsăm să ruleze în timpul animației, ne rescrie camera în fiecare cadru
      this.controls.update();
    }

    this.renderer.render(this.scene, this.camera);
  }

  private downX = 0;
  private downY = 0;

  private handlePointerDown = (ev: PointerEvent) => {
    this.downX = ev.clientX;
    this.downY = ev.clientY;
    if (this.camAnim) this.endCamAnim(); // utilizatorul preia controlul
  };

  /** Cel mai apropiat obiect vizibil de un punct de pe ecran, în raza dată (px) */
  private pickAt(clientX: number, clientY: number, radiusPx: number): number {
    if (!this.store) return -1;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const mx = ((clientX - rect.left) / rect.width) * 2 - 1;
    const my = -(((clientY - rect.top) / rect.height) * 2 - 1);

    const cam: THREE.Camera = this.mapMode ? this.mapCamera : this.camera;
    const n = this.store.size;
    const pos = this.mapMode ? this.mapPos : this.hasSnap ? this.renderPos : this.store.positions;
    let best = -1;
    let bestDist = radiusPx;
    const v = this.tmpV;
    for (let i = 0; i < n; i++) {
      if (!this.store.valid[i]) continue;
      const cat = this.store.entries[i].category;
      if (this.visibleCategories.size > 0 && !this.visibleCategories.has(cat)) continue;
      if (this.highlightSet && !this.highlightSet.has(i)) continue;
      v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      v.project(cam);
      if (v.z > 1) continue;
      const dx = (v.x - mx) * rect.width * 0.5;
      const dy = (v.y - my) * rect.height * 0.5;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  private hoverIndex: number | null = null;

  private handlePointerMove = (ev: PointerEvent) => {
    if (!this.onHover || !this.store) return;
    // în timpul unei rotiri nu are rost să căutăm — utilizatorul mișcă lumea, nu inspectează
    if (ev.buttons !== 0) {
      if (this.hoverIndex !== null) {
        this.hoverIndex = null;
        this.onHover(null);
      }
      return;
    }
    const hit = this.pickAt(ev.clientX, ev.clientY, 14);
    if (hit < 0) {
      if (this.hoverIndex !== null) {
        this.hoverIndex = null;
        this.onHover(null);
      }
      this.renderer.domElement.style.cursor = '';
      return;
    }
    this.renderer.domElement.style.cursor = 'pointer';
    // repoziționăm tooltip-ul chiar dacă e același obiect: se mișcă pe ecran
    this.hoverIndex = hit;
    this.onHover({ index: hit, x: ev.clientX, y: ev.clientY });
  };

  private handlePointerLeave = () => {
    this.hoverIndex = null;
    this.renderer.domElement.style.cursor = '';
    this.onHover?.(null);
  };

  private handleClick = (ev: PointerEvent) => {
    if (!this.store || !this.onPick) return;
    if (Math.hypot(ev.clientX - this.downX, ev.clientY - this.downY) > 5) return;
    const best = this.pickAt(ev.clientX, ev.clientY, 22);
    this.onPick(best >= 0 ? best : null);
  };

  private handleResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.mapCamera) {
      const aspect = w / h;
      const viewH = Math.max(MAP_H, MAP_W / aspect);
      this.mapCamera.left = (-viewH * aspect) / 2;
      this.mapCamera.right = (viewH * aspect) / 2;
      this.mapCamera.top = viewH / 2;
      this.mapCamera.bottom = -viewH / 2;
      this.mapCamera.updateProjectionMatrix();
    }
    this.renderer.setSize(w, h);
  };

  /** Poziția curentă a țintei animației (satelitul se mișcă în timp ce zburăm spre el) */
  private liveTarget(out: THREE.Vector3, a: NonNullable<GlobeEngine['camAnim']>): THREE.Vector3 {
    if (a.index !== null && this.store && this.store.valid[a.index]) {
      const p = this.hasSnap ? this.renderPos : this.store.positions;
      return out.set(p[a.index * 3], p[a.index * 3 + 1], p[a.index * 3 + 2]);
    }
    return out.copy(a.staticTgt);
  }

  private endCamAnim() {
    this.camAnim = null;
    this.controls.enabled = true;
  }

  private startCamAnim(target: THREE.Vector3, index: number | null, toDist: number) {
    const fromTgt = this.controls.target.clone();
    const off = this.camera.position.clone().sub(fromTgt);
    const fromDist = Math.max(off.length(), 1e-4);
    const fromDir = off.divideScalar(fromDist);

    const radial = target.lengthSq() > 1e-9;
    const toDir = radial ? target.clone().normalize() : fromDir.clone();

    const angle = Math.acos(Math.min(1, Math.max(-1, fromDir.dot(toDir))));
    const moved = fromTgt.distanceTo(target);

    // un ocol pe jumătate de glob merită mai mult timp decât o ajustare de câțiva km
    const dur = 420 + (angle / Math.PI) * 900 + Math.min(moved, 3) * 90;

    if (angle < 0.01 && moved < 0.02 && Math.abs(fromDist - toDist) < 0.02) {
      // suntem deja acolo — o animație aici ar fi doar o tresărire
      this.controls.target.copy(target);
      this.camera.position.copy(target).addScaledVector(toDir, toDist);
      this.camera.lookAt(target);
      return;
    }

    this.controls.enabled = false;
    this.camAnim = {
      t0: performance.now(),
      dur,
      fromDir,
      fromDist,
      fromTgt,
      index,
      staticTgt: target.clone(),
      radial,
      toDist,
      angle,
    };
  }

  /** Zbor cinematic către un satelit, pe arc în jurul planetei */
  focusOn(index: number) {
    if (!this.store || !this.store.valid[index]) return;
    if (this.mapMode) {
      this.centerMapOn(index);
      this.rebuildMapTrack();
      return;
    }
    const pos = this.hasSnap ? this.renderPos : this.store.positions;
    const target = new THREE.Vector3(pos[index * 3], pos[index * 3 + 1], pos[index * 3 + 2]);
    this.controls.minDistance = SAT_MIN_DIST;
    this.startCamAnim(target, index, SAT_VIEW_DIST);
  }

  /** Revenire la vederea de ansamblu, cu limitele de zoom repuse pe glob */
  focusHome() {
    const dist = Math.min(Math.max(this.camera.position.length(), 2.6), 8);
    this.controls.minDistance = EARTH_MIN_DIST;
    this.startCamAnim(new THREE.Vector3(0, 0, 0), null, dist);
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.handleClick);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.handlePointerLeave);
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }
}
