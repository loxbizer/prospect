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

/* ─── personnalité ─── */
let headBone = null, faceMesh = null;
const headLook = { x: 0, y: 0, ox: 0, oy: 0 };   // regard lissé + offset « distraction »
const bubble = document.getElementById('robotBubble');
const _headPos = new THREE.Vector3();
let bubbleTimer = null;

function say(text, duration = 2600) {
  if (!bubble) return;
  bubble.textContent = text;
  bubble.classList.add('is-visible');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubble.classList.remove('is-visible'), duration);
}

function setFace(name, intensity = 1, duration = 1.1) {
  if (!faceMesh) return;
  const idx = faceMesh.morphTargetDictionary[name];
  if (idx === undefined) return;
  gsap.to(faceMesh.morphTargetInfluences, {
    [idx]: intensity, duration: 0.18, ease: 'power2.out',
    onComplete: () => gsap.to(faceMesh.morphTargetInfluences, { [idx]: 0, duration: 0.5, delay: duration, ease: 'power2.inOut' }),
  });
}

const EMOTE_FX = {
  Wave:     { say: 'Salut toi 👋',                    face: 'Surprised' },
  Dance:    { say: 'Monte le son 🎶',                 face: 'Surprised' },
  ThumbsUp: { say: 'Validé, chef.',                   face: null },
  Jump:     { say: 'Wouhouuu !',                      face: 'Surprised' },
  No:       { say: 'Hmm… non. On peut mieux faire.',  face: 'Angry' },
  Yes:      { say: 'Carrément.',                      face: null },
  Punch:    { say: 'Bug écrasé 🐛',                   face: 'Angry' },
};

const IDLE_PHRASES = [
  'On crée quoi aujourd’hui ?',
  'Psst… clique sur « Essayer en direct ».',
  '126 modèles dans le ventre, quand même.',
  'Tout open source. Fouille, je n’ai rien à cacher.',
  'Je peux danser aussi, tu sais.',
];

function fadeToAction(name, duration = 0.35) {
  const next = actions[name];
  if (!next || next === activeAction) return;
  const prev = activeAction;
  activeAction = next;
  if (prev) prev.fadeOut(duration);
  next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(duration).play();
}

function playEmote(name, quiet = false) {
  if (!robotReady || !actions[name]) return;
  fadeToAction(name, 0.25);
  const fx = EMOTE_FX[name];
  if (fx && !quiet) {
    if (fx.say) say(fx.say);
    if (fx.face) setFace(fx.face, 1, 0.9);
  }
}

/* petites impulsions de vie quand il ne se passe rien */
function idleLife() {
  const delay = 6000 + Math.random() * 8000;
  setTimeout(() => {
    if (robotReady && heroVisible && activeAction === actions.Idle && !document.getElementById('modal').classList.contains('is-open')) {
      const roll = Math.random();
      if (roll < 0.3) {
        playEmote('Yes', true);
      } else if (roll < 0.45) {
        playEmote('Wave', true);
        say('👋');
      } else if (roll < 0.75) {
        say(IDLE_PHRASES[Math.floor(Math.random() * IDLE_PHRASES.length)], 3200);
      } else {
        /* regarde ailleurs un instant, comme distrait */
        gsap.to(headLook, { ox: (Math.random() - 0.5) * 1.4, oy: (Math.random() - 0.5) * 0.5, duration: 0.1 });
        setTimeout(() => gsap.to(headLook, { ox: 0, oy: 0, duration: 0.1 }), 1600);
      }
    }
    idleLife();
  }, delay);
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

    /* os de la tête (suit le curseur) + visage à morph targets (mimiques) */
    model.traverse((o) => {
      if (o.isBone && o.name === 'Head' && !headBone) headBone = o;
      if (o.morphTargetDictionary && o.morphTargetDictionary.Surprised !== undefined) faceMesh = o;
    });

    fadeToAction('Idle', 0);
    robotReady = true;
    finishPreloader();
    /* petit salut de bienvenue une fois le rideau levé */
    setTimeout(() => { playEmote('Wave', true); say('Bienvenue chez LUMEN ✨', 3000); }, 1400);
    idleLife();
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
    setFace('Surprised', 1, 0.4);
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
      robotGroup.rotation.x += ((heroMouse.y * 0.05) - robotGroup.rotation.x) * 3 * dt;
      robotGroup.position.x += ((heroMouse.x * 0.25) - robotGroup.position.x) * 3 * dt;

      /* la tête suit le curseur (appliqué APRÈS le mixer, en additif) */
      if (headBone) {
        const targX = heroMouse.x * 0.7 + headLook.ox - robotGroup.rotation.y * 0.4;
        const targY = heroMouse.y * 0.35 + headLook.oy;
        headLook.x += (targX - headLook.x) * 6 * dt;
        headLook.y += (targY - headLook.y) * 6 * dt;
        headBone.rotation.y += headLook.x;
        headBone.rotation.x += headLook.y;

        /* la bulle suit la tête à l'écran */
        if (bubble.classList.contains('is-visible')) {
          headBone.getWorldPosition(_headPos).project(heroCamera);
          const bx = (_headPos.x * 0.5 + 0.5) * heroCanvas.clientWidth;
          const by = (-_headPos.y * 0.5 + 0.5) * heroCanvas.clientHeight;
          bubble.style.left = Math.min(Math.max(bx + 60, 130), heroCanvas.clientWidth - 130) + 'px';
          bubble.style.top = Math.max(by - 60, 70) + 'px';
        }
      }
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

/* ═══════════════════════════════════════════════════════
   TOUT FONCTIONNEL : toast, modale, inscription, playground
   ═══════════════════════════════════════════════════════ */

/* ─── toast ─── */
const toast = document.getElementById('toast');
let toastTimer = null;
function showToast(msg, duration = 3200) {
  toast.textContent = msg;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), duration);
}

/* ─── modale ─── */
const modal = document.getElementById('modal');
const modalCard = modal.querySelector('.modal__card');
const viewSignup = document.getElementById('viewSignup');
const viewPlay = document.getElementById('viewPlay');
const signupPlanEl = document.getElementById('signupPlan');
const signupFormWrap = document.getElementById('signupFormWrap');
const signupSuccess = document.getElementById('signupSuccess');
let currentPlan = 'Découverte';

function openModal(view, plan) {
  if (plan) { currentPlan = plan; signupPlanEl.textContent = plan; }
  viewSignup.hidden = view !== 'signup';
  viewPlay.hidden = view !== 'play';
  if (view === 'signup') { signupFormWrap.hidden = false; signupSuccess.hidden = true; }
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  gsap.fromTo(modalCard, { scale: 0.86, opacity: 0, y: 26 }, { scale: 1, opacity: 1, y: 0, duration: 0.55, ease: 'back.out(1.6)' });
  gsap.fromTo(modal.querySelector('.modal__backdrop'), { opacity: 0 }, { opacity: 1, duration: 0.35 });
  const input = view === 'signup' ? document.getElementById('fName') : document.getElementById('playPrompt');
  setTimeout(() => input && input.focus(), 350);
}
function closeModal() {
  gsap.to(modalCard, {
    scale: 0.92, opacity: 0, y: 16, duration: 0.28, ease: 'power2.in',
    onComplete: () => { modal.classList.remove('is-open'); modal.setAttribute('aria-hidden', 'true'); gsap.set(modalCard, { clearProps: 'all' }); },
  });
}
document.addEventListener('click', (e) => {
  const opener = e.target.closest('[data-open]');
  if (opener) { e.preventDefault(); openModal(opener.dataset.open, opener.dataset.plan); return; }
  if (e.target.closest('[data-close]')) closeModal();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal(); });

/* ─── inscription (démo locale : localStorage) ─── */
const signupForm = document.getElementById('signupForm');
signupForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const nameInput = document.getElementById('fName');
  const emailInput = document.getElementById('fEmail');
  const errName = document.getElementById('errName');
  const errEmail = document.getElementById('errEmail');
  const okName = nameInput.value.trim().length >= 2;
  const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailInput.value.trim());
  errName.hidden = okName; nameInput.classList.toggle('is-invalid', !okName);
  errEmail.hidden = okEmail; emailInput.classList.toggle('is-invalid', !okEmail);
  if (!okName || !okEmail) return;

  const submitBtn = document.getElementById('signupSubmit');
  submitBtn.disabled = true;
  submitBtn.querySelector('span').textContent = 'Création…';
  setTimeout(() => {
    const accounts = JSON.parse(localStorage.getItem('lumen-accounts') || '[]');
    accounts.push({ name: nameInput.value.trim(), email: emailInput.value.trim(), plan: currentPlan, at: new Date().toISOString() });
    localStorage.setItem('lumen-accounts', JSON.stringify(accounts));

    signupFormWrap.hidden = true;
    signupSuccess.hidden = false;
    document.getElementById('successMsg').textContent =
      currentPlan === 'Communauté'
        ? `${nameInput.value.trim().split(' ')[0]}, on vous garde une place au chaud sur le Discord (démo).`
        : `Votre compte ${currentPlan} est prêt, ${nameInput.value.trim().split(' ')[0]} — enregistré localement, promis, rien n'est parti sur le réseau.`;
    gsap.fromTo('.modal__check', { scale: 0 }, { scale: 1, duration: 0.6, ease: 'back.out(2.5)' });
    showToast(`✓ Compte ${currentPlan} créé — bienvenue !`);
    submitBtn.disabled = false;
    submitBtn.querySelector('span').textContent = 'Créer mon compte';
    playEmote('ThumbsUp', true);
  }, 900);
});

/* ─── playground : l'IA « fait des trucs », en local ─── */
const PLAY_CAPS = {
  texte:   { chip: '✍️ Texte',   model: 'Mistral 7B Instruct',  type: 'text' },
  image:   { chip: '🎨 Image',   model: 'FLUX.1 [schnell]',     type: 'image' },
  video:   { chip: '🎬 Vidéo',   model: 'LTX-Video',            type: 'steps' },
  code:    { chip: '⌨️ Code',    model: 'DeepSeek Coder 6.7B',  type: 'code' },
  site:    { chip: '🌐 Site',    model: 'Agents LUMEN',         type: 'steps' },
  jeu:     { chip: '🎮 3D',      model: 'TripoSR',              type: 'steps' },
  audio:   { chip: '🎙️ Audio',  model: 'MusicGen small',       type: 'audio' },
  analyse: { chip: '📊 Analyse', model: 'Llama 3 8B + RAG',     type: 'text' },
};
let currentCap = 'texte';
const playCapsEl = document.getElementById('playCaps');
Object.entries(PLAY_CAPS).forEach(([key, cfg], i) => {
  const b = document.createElement('button');
  b.className = 'chip' + (i === 0 ? ' is-playing' : '');
  b.textContent = cfg.chip;
  b.addEventListener('click', () => {
    currentCap = key;
    playCapsEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-playing'));
    b.classList.add('is-playing');
    document.getElementById('playPrompt').focus();
  });
  playCapsEl.appendChild(b);
});

/* les cartes capacités ouvrent le playground pré-réglé */
const CAP_ORDER = ['texte', 'image', 'video', 'code', 'site', 'jeu', 'audio', 'analyse'];
document.querySelectorAll('.cap').forEach((card, i) => {
  const key = CAP_ORDER[i];
  const hint = document.createElement('span');
  hint.className = 'cap__try';
  hint.textContent = '▶ Essayer';
  card.appendChild(hint);
  card.addEventListener('click', () => {
    openModal('play');
    currentCap = key;
    playCapsEl.querySelectorAll('.chip').forEach((c, j) => c.classList.toggle('is-playing', CAP_ORDER[j] === key));
  });
});

/* générateur pseudo-aléatoire déterministe, semé par le prompt */
function seededRng(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const playOut = document.getElementById('playOut');
const playPrompt = document.getElementById('playPrompt');
const playGo = document.getElementById('playGo');

async function pipeline(lines) {
  for (const line of lines) {
    const p = document.createElement('p');
    p.className = 'play__pipe';
    p.innerHTML = `⚙ ${line}…`;
    playOut.appendChild(p);
    await sleep(340 + Math.random() * 420);
    p.innerHTML = `<b>✓</b> ${line}`;
  }
}

function typewriter(el, text, speed = 14) {
  return new Promise((resolve) => {
    let i = 0;
    const iv = setInterval(() => {
      el.textContent = text.slice(0, ++i);
      if (i >= text.length) { clearInterval(iv); resolve(); }
    }, speed);
  });
}

function drawArt(prompt, rng) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 360;
  c.className = 'play__canvas';
  const ctx = c.getContext('2d');
  const palette = ['#8b5cf6', '#22d3ee', '#e879f9', '#f2f0fa', '#4c1d95'];
  const bg = ctx.createLinearGradient(0, 0, 640, 360);
  bg.addColorStop(0, '#0b0818'); bg.addColorStop(1, '#120e24');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 640, 360);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 42; i++) {
    const x = rng() * 640, y = rng() * 360, r = 12 + rng() * 110;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = palette[Math.floor(rng() * palette.length)];
    g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 26; i++) {
    ctx.strokeStyle = palette[Math.floor(rng() * 3)] + '99';
    ctx.lineWidth = 0.5 + rng() * 2;
    ctx.beginPath();
    ctx.moveTo(rng() * 640, rng() * 360);
    ctx.bezierCurveTo(rng() * 640, rng() * 360, rng() * 640, rng() * 360, rng() * 640, rng() * 360);
    ctx.stroke();
  }
  return c;
}

function playMelody(rng, eqBars) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const scale = [0, 3, 5, 7, 10, 12, 15, 17, 19];
  const base = 196 * Math.pow(2, Math.floor(rng() * 2));
  const master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
  const n = 16, step = 0.21;
  for (let i = 0; i < n; i++) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = i % 4 === 0 ? 'sawtooth' : 'triangle';
    osc.frequency.value = base * Math.pow(2, scale[Math.floor(rng() * scale.length)] / 12);
    const t0 = ctx.currentTime + i * step;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.8, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + step * 1.8);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + step * 2);
  }
  /* petit égaliseur qui gigote pendant la lecture */
  const eqTl = gsap.timeline();
  eqBars.forEach((bar) => {
    eqTl.to(bar, {
      height: () => 8 + rng() * 64, duration: 0.14, repeat: Math.ceil((n * step) / 0.14), yoyo: true,
      repeatRefresh: true, ease: 'sine.inOut',
    }, 0);
  });
  eqTl.eventCallback('onComplete', () => gsap.to(eqBars, { height: 6, duration: 0.4 }));
  setTimeout(() => ctx.close(), (n * step + 1) * 1000);
  return n * step;
}

function slugify(s) {
  return (s || 'ma-fonction').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'ma-fonction';
}

let generating = false;
async function generate() {
  if (generating) return;
  const prompt = playPrompt.value.trim() || 'quelque chose de beau';
  const cfg = PLAY_CAPS[currentCap];
  const rng = seededRng(prompt + currentCap);
  generating = true;
  playGo.disabled = true;
  playGo.querySelector('span').textContent = 'Génération…';
  playOut.innerHTML = '';

  await pipeline([`Chargement de <b>${cfg.model}</b>`, 'Inférence locale (démo navigateur)']);

  if (cfg.type === 'text') {
    const el = document.createElement('p');
    el.className = 'play__text';
    playOut.appendChild(el);
    const intro = currentCap === 'analyse'
      ? `Analyse de « ${prompt} » — trois signaux ressortent.\n\n1. La tendance de fond est claire et mesurable sur les données fournies.\n2. Deux segments se détachent nettement ; le troisième mérite un test dédié.\n3. Recommandation : commencer petit, instrumenter, itérer chaque semaine.\n\n(Sortie de démonstration générée localement — branchez vos vraies données pour la version complète.)`
      : `« ${prompt} », donc. Voici une première proposition.\n\nIl y a mille façons d'en parler, mais la meilleure tient en une idée simple : montrer plutôt que promettre. Un paragraphe qui pose le décor, une phrase qui accroche, et une chute qui donne envie de cliquer.\n\n(Sortie de démonstration générée localement — la version complète branche un vrai LLM open source.)`;
    await typewriter(el, intro, 11);
  }

  if (cfg.type === 'code') {
    const el = document.createElement('code');
    el.className = 'play__code';
    playOut.appendChild(el);
    const fn = slugify(prompt).replace(/-/g, '_');
    await typewriter(el,
`// ${prompt}
export function ${fn}(entree) {
  const etapes = ['analyser', 'transformer', 'valider'];
  return etapes.reduce(
    (acc, etape) => appliquer(etape, acc),
    entree,
  );
}

// Démo générée localement — la version complète
// branche DeepSeek Coder sur votre dépôt.`, 8);
  }

  if (cfg.type === 'image') {
    const canvas = drawArt(prompt, rng);
    playOut.appendChild(canvas);
    gsap.from(canvas, { opacity: 0, scale: 0.94, duration: 0.7, ease: 'power3.out' });
    const meta = document.createElement('p');
    meta.className = 'play__meta';
    meta.textContent = `${cfg.model} · « ${prompt} » · 640 × 360 · art procédural de démo, généré dans votre navigateur`;
    playOut.appendChild(meta);
  }

  if (cfg.type === 'audio') {
    const eq = document.createElement('div');
    eq.className = 'play__eq';
    for (let i = 0; i < 28; i++) eq.appendChild(document.createElement('span'));
    playOut.appendChild(eq);
    const bars = [...eq.children];
    playMelody(rng, bars);
    const meta = document.createElement('p');
    meta.className = 'play__meta';
    meta.textContent = `${cfg.model} · mélodie synthétisée en direct par la Web Audio API, semée par votre prompt`;
    playOut.appendChild(meta);
    const replay = document.createElement('button');
    replay.className = 'chip play__replay';
    replay.textContent = '↻ Rejouer';
    replay.addEventListener('click', () => playMelody(seededRng(prompt + currentCap), bars));
    playOut.appendChild(replay);
  }

  if (cfg.type === 'steps') {
    const extra = {
      video: ['Storyboard (4 plans)', 'Génération des images clés', 'Interpolation 24 i/s', 'Encodage h264'],
      site: ['Arborescence & contenu', 'Design system (3 variantes)', 'Intégration responsive', 'Déploiement de prévisualisation'],
      jeu: ['Maillage 3D depuis le prompt', 'Textures PBR', 'Rig & colliders', 'Export glTF'],
    }[currentCap];
    await pipeline(extra);
    const el = document.createElement('p');
    el.className = 'play__text';
    playOut.appendChild(el);
    const outros = {
      video: `🎬 Clip « ${prompt} » prêt : 6 s, 24 i/s, 1280×720.\nDans la vraie plateforme, le fichier apparaît ici avec sa timeline éditable.`,
      site: `🌐 Prévisualisation de « ${prompt} » déployée sur https://demo.lumen-ia.fr/${slugify(prompt)}\nDans la vraie plateforme, ce lien est cliquable et le site éditable en langage naturel.`,
      jeu: `🎮 Modèle 3D « ${prompt} » exporté en glTF (12 400 triangles, PBR).\nDans la vraie plateforme, il se charge ici même, manipulable comme le robot du hero.`,
    };
    await typewriter(el, outros[currentCap], 12);
  }

  playGo.disabled = false;
  playGo.querySelector('span').textContent = 'Générer';
  generating = false;
  playEmote('ThumbsUp', true);
}
playGo.addEventListener('click', generate);
playPrompt.addEventListener('keydown', (e) => { if (e.key === 'Enter') generate(); });
