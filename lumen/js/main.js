/* ═══════════════════════════════════════════════════════
   LUMEN — moteur du site
   3D : Three.js + GLB réels (RobotExpressive CC0, Dragon de Stanford)
   Lumière : UnrealBloom, spots colorés animés, particules, fog
   Motion : GSAP + ScrollTrigger
   ═══════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { RoomEnvironment } from './vendor/environments/RoomEnvironment.js';
import { EffectComposer } from './vendor/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/postprocessing/OutputPass.js';

gsap.registerPlugin(ScrollTrigger);

const loader = new GLTFLoader();
const BG = 0x06040f;
const FLOOR_Y = -1.05;

/* ═══════════════ PRELOADER ═══════════════ */
const preloader = document.getElementById('preloader');
const preloaderCount = document.getElementById('preloaderCount');
const preloaderBar = document.getElementById('preloaderBar');
const progress = { v: 0, real: 0 };
let preloaderDone = false;

const progressTicker = gsap.to(progress, {
  v: 100, duration: 7, ease: 'none',
  onUpdate: () => {
    const shown = Math.round(Math.min(progress.v, progress.real));
    preloaderCount.textContent = shown + ' %';
    preloaderBar.style.width = shown + '%';
  },
});

function finishPreloader() {
  if (preloaderDone) return;
  preloaderDone = true;
  progressTicker.kill();
  progress.real = 100;
  gsap.to(progress, {
    v: 100, duration: 0.35, ease: 'power2.out',
    onUpdate: progressTicker.vars.onUpdate,
    onComplete: () => {
      gsap.timeline()
        .to('.preloader__inner', { yPercent: -30, opacity: 0, duration: 0.55, ease: 'power3.in' })
        .to(preloader, { yPercent: -100, duration: 0.9, ease: 'power4.inOut' }, '-=0.1')
        .set(preloader, { display: 'none' })
        .add(introHero, '-=0.5');
    },
  });
}
setTimeout(finishPreloader, 12000); // filet de sécurité

/* ═══════════════ OUTILS 3D ═══════════════ */
function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.1;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  return r;
}

function normalize(object, targetSize) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = targetSize / Math.max(size.x, size.y, size.z);
  object.scale.setScalar(scale);
  object.position.set(-center.x * scale, FLOOR_Y - box.min.y * scale, -center.z * scale);
  object.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return object;
}

/* ═══════════════ SCÈNE HERO : LE ROBOT ═══════════════ */
const heroCanvas = document.getElementById('heroCanvas');
const heroRenderer = makeRenderer(heroCanvas);
const heroScene = new THREE.Scene();
heroScene.fog = new THREE.FogExp2(BG, 0.045);
const heroPMREM = new THREE.PMREMGenerator(heroRenderer);
heroScene.environment = heroPMREM.fromScene(new RoomEnvironment(), 0.04).texture;

const heroCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
heroCamera.position.set(0, 0.55, 6.4);

/* lumières colorées — leurs teintes tournent en continu */
const spotA = new THREE.SpotLight(0x8b5cf6, 260, 40, Math.PI / 5, 0.5, 1.8);
spotA.position.set(5, 7, 4);
spotA.castShadow = true;
spotA.shadow.mapSize.set(1024, 1024);
spotA.shadow.bias = -0.0002;
spotA.shadow.radius = 5;
heroScene.add(spotA);

const spotB = new THREE.SpotLight(0x22d3ee, 200, 40, Math.PI / 4.5, 0.6, 1.8);
spotB.position.set(-6, 5, 3);
heroScene.add(spotB);

const rimLight = new THREE.PointLight(0xe879f9, 60, 25, 1.7);
rimLight.position.set(0, 2.2, -3.5);
heroScene.add(rimLight);
heroScene.add(new THREE.AmbientLight(0x201a38, 3));

/* sol brillant qui attrape les reflets colorés */
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(16, 64),
  new THREE.MeshStandardMaterial({ color: 0x0a0716, metalness: 0.85, roughness: 0.3 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = FLOOR_Y;
floor.receiveShadow = true;
heroScene.add(floor);

/* champ de particules (additif → attrapé par le bloom) */
function makeParticles(count, spread, size, color) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread;
    pos[i * 3 + 1] = Math.random() * spread * 0.5 - 0.5;
    pos[i * 3 + 2] = (Math.random() - 0.5) * spread;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color, size, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
}
const particlesA = makeParticles(420, 22, 0.035, 0x22d3ee);
const particlesB = makeParticles(300, 26, 0.05, 0x8b5cf6);
heroScene.add(particlesA, particlesB);

/* bloom */
function makeComposer(renderer, scene, camera, strength, radius, threshold) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), strength, radius, threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return { composer, bloom };
}
const heroFX = makeComposer(heroRenderer, heroScene, heroCamera, 0.55, 0.7, 0.82);

const robotGroup = new THREE.Group();
heroScene.add(robotGroup);

let mixer = null;
const actions = {};
let activeAction = null;
const EMOTES = ['Wave', 'Dance', 'ThumbsUp', 'Jump', 'Yes', 'No', 'Punch'];
let robotReady = false;

function fadeToAction(name, duration = 0.35) {
  const next = actions[name];
  if (!next || next === activeAction) return;
  const prev = activeAction;
  activeAction = next;
  if (prev) prev.fadeOut(duration);
  next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
}

function playEmote(name) {
  if (!robotReady || !actions[name]) return;
  fadeToAction(name, 0.25);
}

loader.load('assets/models/RobotExpressive.glb',
  (gltf) => {
    const model = gltf.scene;
    normalize(model, 3.1);
    robotGroup.add(model);
    robotGroup.rotation.y = -0.35;

    mixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach((clip) => {
      const action = mixer.clipAction(clip);
      actions[clip.name] = action;
      if (EMOTES.includes(clip.name) || clip.name === 'Death' || clip.name === 'Standing') {
        action.clampWhenFinished = true;
        action.loop = THREE.LoopOnce;
      }
    });
    mixer.addEventListener('finished', () => fadeToAction('Idle', 0.4));

    fadeToAction('Idle', 0);
    robotReady = true;
    finishPreloader();
    /* petit salut de bienvenue une fois le rideau levé */
    setTimeout(() => playEmote('Wave'), 1400);
  },
  (e) => { if (e.total) progress.real = Math.max(progress.real, (e.loaded / e.total) * 95); },
  (err) => { console.error('Robot introuvable', err); finishPreloader(); }
);

function layoutHero() {
  const w = heroCanvas.clientWidth || window.innerWidth;
  const h = heroCanvas.clientHeight || window.innerHeight;
  heroRenderer.setSize(w, h, false);
  heroFX.composer.setSize(w, h);
  heroCamera.aspect = w / h;
  const shift = w > 900 ? -0.95 : 0;
  heroCamera.setViewOffset(w, h, shift * (w / 6), 0, w, h);
  heroCamera.updateProjectionMatrix();
}
layoutHero();

/* scroll : la caméra plonge et orbite pendant que le hero défile */
gsap.to(heroCamera.position, {
  y: 2.6, z: 8.2,
  ease: 'none',
  scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 0.8 },
});
gsap.to(robotGroup.rotation, {
  y: '+=1.6',
  ease: 'none',
  scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom top', scrub: 0.8 },
});
gsap.to('.hero__content', {
  yPercent: -16, opacity: 0.1, ease: 'none',
  scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom 40%', scrub: true },
});

/* parallaxe souris */
const heroMouse = { x: 0, y: 0 };
window.addEventListener('pointermove', (e) => {
  heroMouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
  heroMouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
});

/* clic sur le robot → émotion aléatoire */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
heroCanvas.addEventListener('click', (e) => {
  if (!robotReady) return;
  const rect = heroCanvas.getBoundingClientRect();
  ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, heroCamera);
  if (raycaster.intersectObjects(robotGroup.children, true).length) {
    playEmote(EMOTES[Math.floor(Math.random() * EMOTES.length)]);
    gsap.fromTo(heroFX.bloom, { strength: 0.55 }, { strength: 1.15, duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.out' });
  }
});

/* pupitre d'émotions */
document.querySelectorAll('.chip[data-emote]').forEach((chip) => {
  chip.addEventListener('click', () => {
    playEmote(chip.dataset.emote);
    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-playing'));
    chip.classList.add('is-playing');
    setTimeout(() => chip.classList.remove('is-playing'), 1600);
    gsap.fromTo(heroFX.bloom, { strength: 0.55 }, { strength: 1.05, duration: 0.3, yoyo: true, repeat: 1, ease: 'power2.out' });
  });
});

/* ═══════════════ SCÈNE MOTEUR : LE DRAGON ═══════════════ */
const dragonCanvas = document.getElementById('dragonCanvas');
const dragonRenderer = makeRenderer(dragonCanvas);
const dragonScene = new THREE.Scene();
dragonScene.fog = new THREE.FogExp2(BG, 0.05);
const dragonPMREM = new THREE.PMREMGenerator(dragonRenderer);
dragonScene.environment = dragonPMREM.fromScene(new RoomEnvironment(), 0.04).texture;

const dragonCamera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
dragonCamera.position.set(0, 0.4, 6.2);

const dragonKey = new THREE.SpotLight(0x22d3ee, 150, 40, Math.PI / 4.5, 0.55, 1.8);
dragonKey.position.set(4, 6, 5);
dragonKey.castShadow = true;
dragonKey.shadow.mapSize.set(1024, 1024);
dragonKey.shadow.bias = -0.0002;
dragonScene.add(dragonKey);
const dragonRim = new THREE.PointLight(0xe879f9, 80, 30, 1.6);
dragonRim.position.set(-3, 1.5, -3);
dragonScene.add(dragonRim);
dragonScene.add(new THREE.AmbientLight(0x201a38, 3));

const dragonFloor = new THREE.Mesh(
  new THREE.CircleGeometry(14, 64),
  new THREE.MeshStandardMaterial({ color: 0x0a0716, metalness: 0.85, roughness: 0.35 })
);
dragonFloor.rotation.x = -Math.PI / 2;
dragonFloor.position.y = FLOOR_Y;
dragonFloor.receiveShadow = true;
dragonScene.add(dragonFloor);
dragonScene.add(makeParticles(260, 18, 0.04, 0xe879f9));

const dragonFX = makeComposer(dragonRenderer, dragonScene, dragonCamera, 0.5, 0.65, 0.85);
const dragonGroup = new THREE.Group();
dragonScene.add(dragonGroup);
let dragonLoaded = false;

function layoutDragon() {
  const w = dragonCanvas.clientWidth, h = dragonCanvas.clientHeight;
  if (!w || !h) return;
  dragonRenderer.setSize(w, h, false);
  dragonFX.composer.setSize(w, h);
  dragonCamera.aspect = w / h;
  dragonCamera.updateProjectionMatrix();
}
layoutDragon();

ScrollTrigger.create({
  trigger: '#moteur',
  start: 'top 140%',
  once: true,
  onEnter: () => {
    loader.load('assets/models/DragonAttenuation.glb', (gltf) => {
      const model = gltf.scene;
      /* le GLB embarque un fond de tissu : on le retire AVANT le centrage
         (three.js assainit les noms de nœuds, d'où le test souple) */
      const toRemove = [];
      model.traverse((o) => { if (/cloth|backdrop/i.test(o.name)) toRemove.push(o); });
      toRemove.forEach((o) => o.parent && o.parent.remove(o));
      normalize(model, 3.4);
      dragonGroup.add(model);
      dragonLoaded = true;
      layoutDragon();
      gsap.fromTo(dragonGroup.scale, { x: 0.001, y: 0.001, z: 0.001 }, { x: 1, y: 1, z: 1, duration: 1.1, ease: 'elastic.out(1, 0.7)' });
    }, undefined, (err) => console.error('Dragon introuvable', err));
  },
});

/* le scroll pilote la rotation du dragon et la couleur des lumières */
const dragonDrive = { rotY: -0.8, hue: 0.52 };
gsap.to(dragonDrive, {
  rotY: Math.PI * 2 - 0.8, hue: 0.95,
  ease: 'none',
  scrollTrigger: { trigger: '#moteur', start: 'top bottom', end: 'bottom top', scrub: 0.6 },
});

/* ═══════════════ BOUCLE DE RENDU ═══════════════ */
const clock = new THREE.Clock();
let heroVisible = true, dragonVisible = false;
new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }).observe(heroCanvas);
new IntersectionObserver(([e]) => { dragonVisible = e.isIntersecting; }).observe(dragonCanvas);

const _colA = new THREE.Color(), _colB = new THREE.Color();

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (heroVisible) {
    if (mixer) mixer.update(dt);
    if (robotReady) {
      robotGroup.rotation.y += 0.05 * dt;
      robotGroup.rotation.x += ((heroMouse.y * 0.05) - robotGroup.rotation.x) * 3 * dt;
      robotGroup.position.x += ((heroMouse.x * 0.25) - robotGroup.position.x) * 3 * dt;
    }
    /* les teintes des projecteurs dérivent lentement */
    spotA.color.setHSL((0.75 + t * 0.012) % 1, 0.75, 0.6);
    spotB.color.setHSL((0.52 + t * 0.017) % 1, 0.8, 0.6);
    rimLight.intensity = 60 + Math.sin(t * 1.4) * 22;
    particlesA.rotation.y = t * 0.02;
    particlesB.rotation.y = -t * 0.014;
    heroFX.composer.render();
  }

  if (dragonVisible) {
    if (dragonLoaded) {
      dragonGroup.rotation.y += (dragonDrive.rotY - dragonGroup.rotation.y) * 4 * dt;
      dragonGroup.position.y = Math.sin(t * 0.8) * 0.05;
    }
    dragonKey.color.copy(_colA.setHSL(dragonDrive.hue % 1, 0.8, 0.62));
    dragonRim.color.copy(_colB.setHSL((dragonDrive.hue + 0.35) % 1, 0.85, 0.62));
    dragonFX.composer.render();
  }

  requestAnimationFrame(tick);
}
tick();

window.addEventListener('resize', () => { layoutHero(); layoutDragon(); });

/* ═══════════════ INTRO HERO ═══════════════ */
function introHero() {
  const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
  tl.from('.hero__line > span', { yPercent: 115, duration: 1.1, stagger: 0.11 })
    .from('.hero__eyebrow > span', { yPercent: 120, opacity: 0, duration: 0.8 }, '-=0.8')
    .from('.hero__sub > span', { yPercent: 120, opacity: 0, duration: 0.8 }, '-=0.65')
    .from('.hero__actions .btn', { y: 24, opacity: 0, duration: 0.7, stagger: 0.09 }, '-=0.5')
    .from('#robotDeck', { y: 30, opacity: 0, duration: 0.7 }, '-=0.5')
    .from('.hero__scroll-hint', { opacity: 0, duration: 0.8 }, '-=0.4')
    .from('.nav', { yPercent: -100, opacity: 0, duration: 0.8 }, '-=0.8')
    .from(heroCamera.position, { z: 11, duration: 1.8, ease: 'power3.out' }, 0);
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
  el.addEventListener('pointerenter', () => follower.classList.add('is-hover'));
  el.addEventListener('pointerleave', () => follower.classList.remove('is-hover'));
});
heroCanvas.addEventListener('pointerenter', () => { follower.classList.add('is-drag'); cursorLabel.textContent = 'Clique-moi'; });
heroCanvas.addEventListener('pointerleave', () => follower.classList.remove('is-drag'));

document.querySelectorAll('.magnetic').forEach((el) => {
  el.addEventListener('pointermove', (e) => {
    const r = el.getBoundingClientRect();
    gsap.to(el, { x: (e.clientX - r.left - r.width / 2) * 0.28, y: (e.clientY - r.top - r.height / 2) * 0.28, duration: 0.4, ease: 'power2.out' });
  });
  el.addEventListener('pointerleave', () => gsap.to(el, { x: 0, y: 0, duration: 0.7, ease: 'elastic.out(1, 0.4)' }));
});

/* ═══════════════ NAV / MENU ═══════════════ */
const nav = document.getElementById('nav');
ScrollTrigger.create({ start: 80, onUpdate: (self) => nav.classList.toggle('is-scrolled', self.scroll() > 80) });
const burger = document.getElementById('burger');
const mobileMenu = document.getElementById('mobileMenu');
burger.addEventListener('click', () => { burger.classList.toggle('is-open'); mobileMenu.classList.toggle('is-open'); });
mobileMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => {
  burger.classList.remove('is-open'); mobileMenu.classList.remove('is-open');
}));
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth' });
  });
});

/* ═══════════════ ANIMATIONS AU SCROLL ═══════════════ */
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
  /* background-clip:text ne traverse pas les inline-blocks :
     chaque mot d'un .grad doit porter son propre dégradé */
  el.querySelectorAll('.grad').forEach((g) =>
    g.querySelectorAll('.w').forEach((w) => w.classList.add('grad')));
  gsap.from(el.querySelectorAll('.w'), {
    yPercent: 110, duration: 1, ease: 'power4.out', stagger: 0.035,
    scrollTrigger: { trigger: el, start: 'top 85%' },
  });
});

/* compteurs (format fr, millions abrégés) */
document.querySelectorAll('.stat__num').forEach((el) => {
  const target = +el.dataset.count;
  const obj = { v: 0 };
  ScrollTrigger.create({
    trigger: el, start: 'top 90%', once: true,
    onEnter: () => gsap.to(obj, {
      v: target, duration: 2.2, ease: 'power3.out',
      onUpdate: () => {
        el.textContent = target >= 1e6
          ? (obj.v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M'
          : Math.round(obj.v).toLocaleString('fr-FR');
      },
    }),
  });
});

/* cartes : reveal + inclinaison 3D + halo qui suit la souris */
gsap.utils.toArray('.cap, .plan').forEach((card, i) => {
  gsap.from(card, {
    y: 70, opacity: 0, duration: 1, ease: 'power3.out', delay: (i % 4) * 0.07,
    scrollTrigger: { trigger: card, start: 'top 94%' },
  });
});
document.querySelectorAll('.tilt').forEach((card) => {
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    card.style.setProperty('--mx', px * 100 + '%');
    card.style.setProperty('--my', py * 100 + '%');
    gsap.to(card, {
      rotateY: (px - 0.5) * 10, rotateX: (0.5 - py) * 8,
      transformPerspective: 700, duration: 0.5, ease: 'power2.out',
    });
  });
  card.addEventListener('pointerleave', () => {
    gsap.to(card, { rotateY: 0, rotateX: 0, duration: 0.8, ease: 'elastic.out(1, 0.5)' });
  });
});

/* étapes du moteur */
gsap.utils.toArray('.engine__step').forEach((step) => {
  gsap.from(step, {
    y: 60, opacity: 0, duration: 1, ease: 'power3.out',
    scrollTrigger: { trigger: step, start: 'top 80%' },
  });
});

/* marquee infini */
const marqueeTrack = document.getElementById('marqueeTrack');
let marqueeX = 0;
gsap.ticker.add((t, dtMs) => {
  marqueeX -= dtMs * 0.045;
  const half = marqueeTrack.scrollWidth / 2;
  if (-marqueeX >= half) marqueeX += half;
  marqueeTrack.style.transform = `translateX(${marqueeX}px)`;
});

/* aurora : dérive lente des nappes de couleur */
gsap.to('.aurora__blob--1', { xPercent: 18, yPercent: 12, duration: 26, yoyo: true, repeat: -1, ease: 'sine.inOut' });
gsap.to('.aurora__blob--2', { xPercent: -14, yPercent: 18, duration: 32, yoyo: true, repeat: -1, ease: 'sine.inOut' });
gsap.to('.aurora__blob--3', { xPercent: 12, yPercent: -16, duration: 29, yoyo: true, repeat: -1, ease: 'sine.inOut' });

/* orbe du CTA qui respire */
gsap.to('.cta__orb', { scale: 1.15, duration: 5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
