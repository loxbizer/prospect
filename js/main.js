/* ═══════════════════════════════════════════════════════
   ÉLOGE — moteur du site
   3D : Three.js + vrais modèles GLB (Khronos glTF Sample Assets)
   Motion : GSAP + ScrollTrigger
   ═══════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { RoomEnvironment } from './vendor/environments/RoomEnvironment.js';

gsap.registerPlugin(ScrollTrigger);

const MODELS = {
  sofa:   { file: 'assets/models/GlamVelvetSofa.glb',        size: 3.0, yOffset: 0 },
  chair:  { file: 'assets/models/SheenChair.glb',            size: 2.6, yOffset: 0 },
  damask: { file: 'assets/models/ChairDamaskPurplegold.glb', size: 2.4, yOffset: 0 },
};

const VARIANT_LABELS = {
  'Champagne': 'Champagne', 'Navy': 'Bleu nuit', 'Gray': 'Gris perle', 'Grey': 'Gris perle',
  'Peacock': 'Paon', 'Blush': 'Poudré', 'Mango Velvet': 'Velours mangue',
  'Peacock Velvet': 'Velours paon', 'Saffron Velvet': 'Velours safran',
};

const loader = new GLTFLoader();
const modelCache = new Map();
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function loadModel(key, onProgress) {
  if (modelCache.has(key)) return Promise.resolve(modelCache.get(key));
  return new Promise((resolve, reject) => {
    loader.load(MODELS[key].file, (gltf) => {
      modelCache.set(key, gltf);
      resolve(gltf);
    }, onProgress, reject);
  });
}

const FLOOR_Y = -0.83;

/* centre le modèle, le met à l'échelle voulue et pose sa base sur le sol */
function normalize(object, targetSize) {
  object.scale.setScalar(1);
  object.position.set(0, 0, 0);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z);
  object.scale.setScalar(scale);
  object.position.set(-center.x * scale, FLOOR_Y - box.min.y * scale, -center.z * scale);
  object.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  return object;
}

function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  return r;
}

function makeScene(renderer) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const key = new THREE.SpotLight(0xfff1d6, 90, 30, Math.PI / 5, 0.45, 1.6);
  key.position.set(4, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0002;
  key.shadow.radius = 6;
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xc9a86a, 1.4);
  rim.position.set(-5, 3, -4);
  scene.add(rim);

  scene.add(new THREE.AmbientLight(0x2a2620, 2.2));

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShadowMaterial({ opacity: 0.42 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);

  return scene;
}

/* KHR_materials_variants — sélection d'une variante de matière
   (implémentation d'après l'exemple officiel three.js webgl_loader_gltf_variants) */
async function selectVariant(sceneRoot, parser, extensionDef, variantName) {
  const variantIndex = extensionDef.variants.findIndex((v) => v.name === variantName);
  if (variantIndex < 0) return;
  const jobs = [];
  sceneRoot.traverse((object) => {
    if (!object.isMesh || !object.userData.gltfExtensions) return;
    const meshDef = object.userData.gltfExtensions['KHR_materials_variants'];
    if (!meshDef) return;
    if (!object.userData.originalMaterial) object.userData.originalMaterial = object.material;
    const mapping = meshDef.mappings.find((m) => m.variants.includes(variantIndex));
    if (mapping) {
      jobs.push(parser.getDependency('material', mapping.material).then((mat) => {
        object.material = mat;
        parser.assignFinalMaterial(object);
      }));
    } else {
      object.material = object.userData.originalMaterial;
    }
  });
  await Promise.all(jobs);
}

function getVariantExtension(gltf) {
  return gltf.userData?.gltfExtensions?.['KHR_materials_variants'] || null;
}

/* ═══════════════ PRELOADER ═══════════════ */
const preloader = document.getElementById('preloader');
const preloaderCount = document.getElementById('preloaderCount');
const preloaderBar = document.getElementById('preloaderBar');
const progress = { v: 0, real: 0 };

function setProgress(p) {
  progress.real = Math.max(progress.real, p);
}
const progressTicker = gsap.to(progress, {
  v: 100, duration: 8, ease: 'none', paused: true,
  onUpdate: () => {
    const shown = Math.round(Math.min(progress.v, progress.real));
    preloaderCount.textContent = shown + ' %';
    preloaderBar.style.width = shown + '%';
  },
});
progressTicker.play();

let preloaderDone = false;
function finishPreloader() {
  if (preloaderDone) return;
  preloaderDone = true;
  progressTicker.kill();
  setProgress(100);
  gsap.to(progress, {
    v: 100, duration: 0.4, ease: 'power2.out',
    onUpdate: progressTicker.vars.onUpdate,
    onComplete: () => {
      const tl = gsap.timeline();
      tl.to('.preloader__inner', { yPercent: -30, opacity: 0, duration: 0.6, ease: 'power3.in' })
        .to(preloader, { yPercent: -100, duration: 0.9, ease: 'power4.inOut' }, '-=0.15')
        .set(preloader, { display: 'none' })
        .add(introHero, '-=0.55');
    },
  });
}

/* ═══════════════ HERO 3D ═══════════════ */
const heroCanvas = document.getElementById('heroCanvas');
const heroRenderer = makeRenderer(heroCanvas);
const heroScene = makeScene(heroRenderer);
const heroCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
heroCamera.position.set(0, 0.55, 5.2);

const heroGroup = new THREE.Group();
heroScene.add(heroGroup);
const heroMouse = { x: 0, y: 0 };
let heroModelReady = false;

function layoutHero() {
  const w = heroCanvas.clientWidth || window.innerWidth;
  const h = heroCanvas.clientHeight || window.innerHeight;
  heroRenderer.setSize(w, h, false);
  heroCamera.aspect = w / h;
  /* décale la scène vers la droite sur desktop pour laisser la place au texte */
  const shift = w > 980 ? -0.9 : 0;
  heroCamera.setViewOffset(w, h, shift * (w / 6), 0, w, h);
  heroCamera.updateProjectionMatrix();
}
layoutHero();

loadModel('sofa', (e) => { if (e.total) setProgress((e.loaded / e.total) * 90); })
  .then((gltf) => {
    const model = gltf.scene;
    normalize(model, MODELS.sofa.size);
    heroGroup.add(model);
    heroGroup.rotation.y = -0.55;
    heroModelReady = true;
    finishPreloader();
  })
  .catch((err) => { console.error('Modèle hero introuvable', err); finishPreloader(); });

/* rotation liée au scroll sur toute la section hero */
gsap.to(heroGroup.rotation, {
  y: '+=2.4',
  ease: 'none',
  scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 0.8 },
});
gsap.to(heroCamera.position, {
  y: 1.6, z: 6.4,
  ease: 'none',
  scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 0.8 },
});
gsap.to('.hero__content', {
  yPercent: -18, opacity: 0.15, ease: 'none',
  scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom 35%', scrub: true },
});

/* parallaxe souris */
window.addEventListener('pointermove', (e) => {
  heroMouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
  heroMouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
});

/* clic sur le canapé du hero → impulsion */
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let heroSpin = { v: 0 };
heroCanvas.addEventListener('click', (e) => {
  if (!heroModelReady) return;
  const rect = heroCanvas.getBoundingClientRect();
  pointerNDC.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(pointerNDC, heroCamera);
  if (raycaster.intersectObjects(heroGroup.children, true).length) {
    gsap.fromTo(heroSpin, { v: 0 }, {
      v: Math.PI * 2, duration: 1.6, ease: 'power3.out',
      onUpdate: () => { heroGroup.rotation.y += (heroSpin.v - (heroSpin.prev || 0)); heroSpin.prev = heroSpin.v; },
      onStart: () => { heroSpin.prev = 0; },
    });
    gsap.fromTo(heroGroup.scale, { x: 1, y: 1, z: 1 }, {
      x: 1.04, y: 0.96, z: 1.04, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.inOut',
    });
  }
});

/* ═══════════════ ATELIER 3D ═══════════════ */
const atelierCanvas = document.getElementById('atelierCanvas');
const atelierRenderer = makeRenderer(atelierCanvas);
const atelierScene = makeScene(atelierRenderer);
const atelierCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
atelierCamera.position.set(0, 0.9, 5.6);
atelierCamera.lookAt(0, 0, 0);

const atelierGroup = new THREE.Group();
atelierScene.add(atelierGroup);
const atelierLoading = document.getElementById('atelierLoading');
const variantList = document.getElementById('variantList');
let atelierState = { key: null, gltf: null, dragging: false, moved: 0, vx: 0, autorotate: true };

function layoutAtelier() {
  const w = atelierCanvas.clientWidth, h = atelierCanvas.clientHeight;
  if (!w || !h) return;
  atelierRenderer.setSize(w, h, false);
  atelierCamera.aspect = w / h;
  atelierCamera.updateProjectionMatrix();
}
layoutAtelier();

function buildVariantButtons(gltf, sceneRoot) {
  variantList.innerHTML = '';
  const ext = getVariantExtension(gltf);
  const wrap = document.getElementById('variantSwitcher');
  if (!ext || !ext.variants.length) {
    wrap.style.opacity = '0.35';
    variantList.innerHTML = '<span style="font-size:.75rem;color:var(--ink-dim)">matière unique pour cette pièce</span>';
    return;
  }
  wrap.style.opacity = '1';
  ext.variants.forEach((v, i) => {
    const b = document.createElement('button');
    b.className = 'variant-btn' + (i === 0 ? ' is-active' : '');
    b.textContent = VARIANT_LABELS[v.name] || v.name;
    b.dataset.cursor = 'hover';
    b.addEventListener('click', async () => {
      variantList.querySelectorAll('.variant-btn').forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      await selectVariant(sceneRoot, gltf.parser, ext, v.name);
      gsap.fromTo(atelierGroup.scale, { x: 0.97, y: 0.97, z: 0.97 }, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'back.out(2.5)' });
    });
    variantList.appendChild(b);
  });
  /* applique la première variante pour partir d'un état cohérent */
  selectVariant(sceneRoot, gltf.parser, ext, ext.variants[0].name);
}

async function showModel(key) {
  if (atelierState.key === key) return;
  atelierState.key = key;
  const hadModel = atelierGroup.children.length > 0;

  if (hadModel) {
    const out = gsap.timeline();
    out.to(atelierGroup.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.45, ease: 'power3.in' })
       .to(atelierGroup.rotation, { y: '+=1.2', duration: 0.45, ease: 'power3.in' }, '<');
    await out;
  }
  if (atelierState.key !== key) return; // un autre clic est passé entre-temps

  if (!modelCache.has(key)) atelierLoading.classList.add('is-visible');
  let gltf;
  try {
    gltf = await loadModel(key);
  } catch (err) {
    console.error('Chargement du modèle impossible', err);
    atelierLoading.classList.remove('is-visible');
    return;
  }
  atelierLoading.classList.remove('is-visible');
  if (atelierState.key !== key) return;

  atelierGroup.clear();
  /* clone : le canapé d'origine vit déjà dans la scène du hero */
  const model = gltf.scene.clone(true);
  normalize(model, MODELS[key].size);
  atelierGroup.add(model);
  atelierState.gltf = gltf;
  buildVariantButtons(gltf, model);

  atelierGroup.rotation.y = -0.4;
  gsap.fromTo(atelierGroup.scale, { x: 0.001, y: 0.001, z: 0.001 }, { x: 1, y: 1, z: 1, duration: 0.9, ease: 'elastic.out(1, 0.65)' });
  gsap.fromTo(atelierGroup.position, { y: -0.6 }, { y: 0, duration: 0.7, ease: 'power3.out' });
}

/* rotation au cliquer-glisser + inertie */
let lastX = 0;
atelierCanvas.addEventListener('pointerdown', (e) => {
  atelierState.dragging = true;
  atelierState.moved = 0;
  lastX = e.clientX;
  atelierCanvas.classList.add('is-dragging');
  atelierCanvas.setPointerCapture(e.pointerId);
});
atelierCanvas.addEventListener('pointermove', (e) => {
  if (!atelierState.dragging) return;
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  atelierState.moved += Math.abs(dx);
  atelierState.vx = dx * 0.006;
  atelierGroup.rotation.y += dx * 0.006;
});
atelierCanvas.addEventListener('pointerup', (e) => {
  atelierState.dragging = false;
  atelierCanvas.classList.remove('is-dragging');
  /* clic net (pas un drag) sur la pièce → animation */
  if (atelierState.moved < 6 && atelierGroup.children.length) {
    const rect = atelierCanvas.getBoundingClientRect();
    pointerNDC.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointerNDC, atelierCamera);
    if (raycaster.intersectObjects(atelierGroup.children, true).length) {
      gsap.fromTo(atelierGroup.position, { y: 0 }, { y: 0.35, duration: 0.32, yoyo: true, repeat: 1, ease: 'power2.out' });
      gsap.fromTo(atelierGroup.scale, { x: 1, y: 1 }, { x: 1.05, y: 0.94, duration: 0.16, yoyo: true, repeat: 1, ease: 'power2.inOut', delay: 0.6 });
      gsap.to(atelierGroup.rotation, { y: '+=' + Math.PI * 2, duration: 1.4, ease: 'power3.inOut' });
    }
  }
});

/* boutons de changement de modèle */
document.querySelectorAll('.model-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.model-btn').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    showModel(btn.dataset.model);
  });
});

/* chargement de la scène atelier quand la section approche */
ScrollTrigger.create({
  trigger: '#atelier3d',
  start: 'top 120%',
  once: true,
  onEnter: () => showModel('sofa').then(() => {
    /* pré-charge les deux autres pièces en tâche de fond */
    loadModel('chair').catch(() => {});
    loadModel('damask').catch(() => {});
  }),
});

/* ═══════════════ BOUCLE DE RENDU ═══════════════ */
const clock = new THREE.Clock();
let heroVisible = true, atelierVisible = false;
new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }).observe(heroCanvas);
new IntersectionObserver(([e]) => { atelierVisible = e.isIntersecting; }).observe(atelierCanvas);

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);

  if (heroVisible) {
    if (heroModelReady) {
      heroGroup.rotation.y += 0.04 * dt;
      heroGroup.rotation.x += ((heroMouse.y * 0.06) - heroGroup.rotation.x) * 3 * dt;
      heroGroup.position.x += ((heroMouse.x * 0.14) - heroGroup.position.x) * 3 * dt;
      heroGroup.position.y = Math.sin(clock.elapsedTime * 0.7) * 0.03;
    }
    heroRenderer.render(heroScene, heroCamera);
  }

  if (atelierVisible) {
    if (!atelierState.dragging) {
      atelierState.vx *= 0.94;
      atelierGroup.rotation.y += atelierState.vx + 0.12 * dt;
    }
    atelierRenderer.render(atelierScene, atelierCamera);
  }
  requestAnimationFrame(tick);
}
tick();

window.addEventListener('resize', () => { layoutHero(); layoutAtelier(); });

/* ═══════════════ INTRO HERO ═══════════════ */
function introHero() {
  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
  tl.from('.hero__line > span', { yPercent: 115, duration: 1.2, stagger: 0.12 })
    .from('.hero__eyebrow > span', { yPercent: 120, opacity: 0, duration: 0.9 }, '-=0.9')
    .from('.hero__sub > span', { yPercent: 120, opacity: 0, duration: 0.9 }, '-=0.75')
    .from('.hero__actions .btn', { y: 26, opacity: 0, duration: 0.8, stagger: 0.1 }, '-=0.6')
    .from('.hero__scroll-hint', { opacity: 0, duration: 1 }, '-=0.4')
    .from('.nav', { yPercent: -100, opacity: 0, duration: 0.8 }, '-=0.9')
    .from(heroGroup.position, { z: -3, duration: 1.6, ease: 'power3.out' }, 0);
}

/* ═══════════════ CURSEUR & MAGNÉTIQUE ═══════════════ */
const cursor = document.getElementById('cursor');
const follower = document.getElementById('cursorFollower');
const cursorLabel = document.getElementById('cursorLabel');
const pos = { x: -100, y: -100 }, fol = { x: -100, y: -100 };

window.addEventListener('pointermove', (e) => { pos.x = e.clientX; pos.y = e.clientY; });
gsap.ticker.add(() => {
  fol.x += (pos.x - fol.x) * 0.13;
  fol.y += (pos.y - fol.y) * 0.13;
  cursor.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%,-50%)`;
  follower.style.transform = `translate(${fol.x}px, ${fol.y}px) translate(-50%,-50%)`;
});

document.querySelectorAll('[data-cursor]').forEach((el) => {
  el.addEventListener('pointerenter', () => {
    const mode = el.dataset.cursor;
    follower.classList.toggle('is-hover', mode === 'hover');
    follower.classList.toggle('is-view', mode === 'view');
    if (mode === 'view') cursorLabel.textContent = 'Voir';
  });
  el.addEventListener('pointerleave', () => {
    follower.classList.remove('is-hover', 'is-view');
  });
});
atelierCanvas.addEventListener('pointerenter', () => { follower.classList.add('is-drag'); cursorLabel.textContent = '⟲ 3D'; });
atelierCanvas.addEventListener('pointerleave', () => { follower.classList.remove('is-drag'); });

document.querySelectorAll('.magnetic').forEach((el) => {
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    gsap.to(el, {
      x: (e.clientX - r.left - r.width / 2) * 0.3,
      y: (e.clientY - r.top - r.height / 2) * 0.3,
      duration: 0.4, ease: 'power2.out',
    });
  });
  el.addEventListener('pointerleave', () => {
    gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
  });
});

/* ═══════════════ NAV ═══════════════ */
const nav = document.getElementById('nav');
ScrollTrigger.create({
  start: 80,
  onUpdate: (self) => nav.classList.toggle('is-scrolled', self.scroll() > 80),
});

const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobileMenu');
burger.addEventListener('click', () => {
  burger.classList.toggle('is-open');
  mobileMenu.classList.toggle('is-open');
});
mobileMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
  burger.classList.remove('is-open');
  mobileMenu.classList.remove('is-open');
}));

/* défilement doux vers les ancres */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth' });
  });
});

/* ═══════════════ ANIMATIONS AU SCROLL ═══════════════ */

/* découpe en mots pour les titres — préserve <em>, <br>, etc. */
function splitTextNodes(node) {
  [...node.childNodes].forEach((child) => {
    if (child.nodeType === Node.ELEMENT_NODE) { splitTextNodes(child); return; }
    if (child.nodeType !== Node.TEXT_NODE || !child.textContent.trim()) return;
    const frag = document.createDocumentFragment();
    child.textContent.split(' ').forEach((word, i, arr) => {
      if (word) {
        const mask = document.createElement('span');
        mask.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:top;';
        const inner = document.createElement('span');
        inner.className = 'w';
        inner.style.display = 'inline-block';
        inner.textContent = word;
        mask.appendChild(inner);
        frag.appendChild(mask);
      }
      if (i < arr.length - 1) frag.appendChild(document.createTextNode(' '));
    });
    child.replaceWith(frag);
  });
}
document.querySelectorAll('.split-words').forEach((el) => {
  splitTextNodes(el);
  gsap.from(el.querySelectorAll('.w'), {
    yPercent: 110, duration: 1, ease: 'power4.out', stagger: 0.035,
    scrollTrigger: { trigger: el, start: 'top 85%' },
  });
});

/* compteurs */
document.querySelectorAll('.stat__num').forEach((el) => {
  const target = +el.dataset.count;
  const obj = { v: 0 };
  ScrollTrigger.create({
    trigger: el, start: 'top 88%', once: true,
    onEnter: () => gsap.to(obj, {
      v: target, duration: 2.2, ease: 'power3.out',
      onUpdate: () => { el.textContent = Math.round(obj.v).toLocaleString('fr-FR'); },
    }),
  });
});

/* cartes collections */
gsap.utils.toArray('.card').forEach((card, i) => {
  gsap.from(card, {
    y: 90, opacity: 0, duration: 1.1, ease: 'power3.out', delay: (i % 3) * 0.08,
    scrollTrigger: { trigger: card, start: 'top 92%' },
  });
  const img = card.querySelector('.card__media img');
  if (img) gsap.fromTo(img, { yPercent: -6 }, {
    yPercent: 6, ease: 'none',
    scrollTrigger: { trigger: card, start: 'top bottom', end: 'bottom top', scrub: true },
  });
});

/* parallaxe des images étapes + CTA */
gsap.utils.toArray('.parallax-img img').forEach((img) => {
  gsap.fromTo(img, { yPercent: -9 }, {
    yPercent: 9, ease: 'none',
    scrollTrigger: { trigger: img.closest('.parallax-img'), start: 'top bottom', end: 'bottom top', scrub: true },
  });
});

/* étapes savoir-faire */
gsap.utils.toArray('.step').forEach((step) => {
  gsap.from(step.querySelector('.step__text'), {
    y: 60, opacity: 0, duration: 1, ease: 'power3.out',
    scrollTrigger: { trigger: step, start: 'top 78%' },
  });
  gsap.from(step.querySelector('.step__media'), {
    clipPath: 'inset(0 0 100% 0)', duration: 1.3, ease: 'power4.inOut',
    scrollTrigger: { trigger: step, start: 'top 82%' },
  });
});

/* stage atelier */
gsap.from('.atelier3d__stage', {
  y: 80, opacity: 0, duration: 1.1, ease: 'power3.out',
  scrollTrigger: { trigger: '.atelier3d__stage', start: 'top 88%' },
});
gsap.from('.model-btn', {
  y: 40, opacity: 0, stagger: 0.09, duration: 0.8, ease: 'power3.out',
  scrollTrigger: { trigger: '.atelier3d__controls', start: 'top 95%' },
});

/* marquee infini */
const marqueeTrack = document.getElementById('marqueeTrack');
let marqueeX = 0;
gsap.ticker.add((t, dtMs) => {
  marqueeX -= dtMs * 0.04;
  const half = marqueeTrack.scrollWidth / 2;
  if (-marqueeX >= half) marqueeX += half;
  marqueeTrack.style.transform = `translateX(${marqueeX}px)`;
});

/* ═══════════════ TÉMOIGNAGES ═══════════════ */
const quotes = gsap.utils.toArray('.quote');
const quoteIndexEl = document.getElementById('quoteIndex');
let quoteI = 0, quoteBusy = false;

function goQuote(dir) {
  if (quoteBusy) return;
  quoteBusy = true;
  const current = quotes[quoteI];
  quoteI = (quoteI + dir + quotes.length) % quotes.length;
  const next = quotes[quoteI];
  gsap.to(current, {
    opacity: 0, x: -40 * dir, duration: 0.45, ease: 'power2.in',
    onComplete: () => {
      current.classList.remove('is-active');
      gsap.set(current, { clearProps: 'all' });
      next.classList.add('is-active');
      gsap.fromTo(next, { opacity: 0, x: 40 * dir }, {
        opacity: 1, x: 0, duration: 0.55, ease: 'power3.out',
        onComplete: () => { quoteBusy = false; },
      });
      quoteIndexEl.textContent = String(quoteI + 1).padStart(2, '0');
    },
  });
}
document.getElementById('quoteNext').addEventListener('click', () => goQuote(1));
document.getElementById('quotePrev').addEventListener('click', () => goQuote(-1));

/* cartes collections → prise de contact */
document.querySelectorAll('.card').forEach((card) => {
  card.addEventListener('click', () => {
    document.getElementById('contact').scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth' });
  });
});

/* ═══════════════ FALLBACK IMAGES ═══════════════ */
document.querySelectorAll('img').forEach((img) => {
  img.addEventListener('error', () => img.classList.add('is-broken'));
});

/* filet de sécurité : si le modèle du hero traîne, on libère quand même l'écran */
setTimeout(() => { if (preloader.style.display !== 'none' && !heroModelReady) finishPreloader(); }, 12000);
