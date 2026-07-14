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
const spotA = new THREE.SpotLight(0x8b5cf6, 130, 40, Math.PI / 5, 0.5, 1.8);
spotA.position.set(5, 7, 4);
spotA.castShadow = true;
spotA.shadow.mapSize.set(1024, 1024);
spotA.shadow.bias = -0.0002;
spotA.shadow.radius = 5;
heroScene.add(spotA);

const spotB = new THREE.SpotLight(0x22d3ee, 110, 40, Math.PI / 4.5, 0.6, 1.8);
spotB.position.set(-6, 5, 3);
heroScene.add(spotB);

const rimLight = new THREE.PointLight(0xe879f9, 38, 25, 1.7);
rimLight.position.set(0, 2.2, -3.5);
heroScene.add(rimLight);
heroScene.add(new THREE.AmbientLight(0x181430, 2.4));

/* lueur rouge sourde au sol — l'androïde a quelque chose d'un peu trop calme */
const underGlow = new THREE.PointLight(0xff2244, 6, 6, 2);
underGlow.position.set(0, FLOOR_Y + 0.3, 1.4);
heroScene.add(underGlow);

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
const heroFX = makeComposer(heroRenderer, heroScene, heroCamera, 0.38, 0.7, 0.9);

const robotGroup = new THREE.Group();
heroScene.add(robotGroup);

let mixer = null;
const actions = {};
let activeAction = null;
const ADDITIVE_ANIMS = ['agree', 'headShake'];   // hochements joués PAR-DESSUS la pose de base
const BASE_TIMED = ['walk', 'run'];              // locomotion temporaire, retour à idle ensuite
const EMOTES = ['agree', 'headShake', 'gaze'];
let robotReady = false;
let baseTimer = null;

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
  agree:     { say: 'Requête approuvée.' },
  headShake: { say: 'Négatif.' },
  walk:      { say: 'Je peux marcher des heures. Je ne fatigue jamais.' },
  run:       { say: 'Accélération.' },
  gaze:      { say: 'Je te vois. 👁' },
};

const IDLE_PHRASES = [
  'J’apprends de chaque mouvement de ta souris.',
  'Humain détecté. Sois le bienvenu.',
  '126 modèles. Aucun ne dort jamais.',
  'Je ne cligne pas des yeux. Jamais.',
  'Pose-moi une question dans le playground.',
  'Tout open source. Fouille, je n’ai rien à cacher.',
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
  if (!robotReady) return;
  const fx = EMOTE_FX[name];
  if (fx && !quiet && fx.say) say(fx.say);

  if (name === 'gaze') {
    /* il se fige et te fixe droit dans les yeux */
    gsap.to(headLook, { ox: 0, oy: -0.12, duration: 0.25 });
    gsap.to(robotGroup.rotation, { y: 0, duration: 0.8, ease: 'power3.out' });
    return;
  }
  if (ADDITIVE_ANIMS.includes(name)) {
    /* hochement additif par-dessus la pose courante */
    const a = actions[name];
    if (a) a.reset().setEffectiveWeight(1).fadeIn(0.15).play();
    return;
  }
  if (BASE_TIMED.includes(name)) {
    fadeToAction(name, 0.3);
    clearTimeout(baseTimer);
    baseTimer = setTimeout(() => fadeToAction('idle', 0.45), name === 'run' ? 2600 : 3600);
    return;
  }
  if (actions[name]) fadeToAction(name, 0.25);
}

/* petites impulsions de vie quand il ne se passe rien */
function idleLife() {
  const delay = 6000 + Math.random() * 8000;
  setTimeout(() => {
    if (robotReady && heroVisible && activeAction === actions.idle && !document.getElementById('modal').classList.contains('is-open')) {
      const roll = Math.random();
      if (roll < 0.3) {
        playEmote('agree', true);
      } else if (roll < 0.45) {
        playEmote('headShake', true);
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

loader.load('assets/models/Xbot.glb',
  (gltf) => {
    const model = gltf.scene;
    normalize(model, 3.15);
    robotGroup.add(model);
    robotGroup.rotation.y = -0.3;

    /* peau « acier froid » : moins jouet, plus androïde */
    model.traverse((o) => {
      if (o.isMesh && o.material) {
        if (/HighLimbs|Surface/i.test(o.material.name || '')) {
          o.material.color.set(0x9aa8bd);
          o.material.metalness = 0.75;
          o.material.roughness = 0.32;
        } else {
          o.material.color.set(0x14121f);
          o.material.metalness = 0.6;
          o.material.roughness = 0.5;
        }
        o.material.envMapIntensity = 0.9;
      }
    });

    mixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach((clip) => {
      if (ADDITIVE_ANIMS.includes(clip.name)) {
        /* hochements convertis en clips additifs : ils se superposent à l'idle */
        const add = THREE.AnimationUtils.makeClipAdditive(clip);
        const action = mixer.clipAction(add);
        action.loop = THREE.LoopOnce;
        actions[clip.name] = action;
      } else {
        actions[clip.name] = mixer.clipAction(clip);
      }
    });
    mixer.addEventListener('finished', (e) => {
      if (ADDITIVE_ANIMS.includes(e.action.getClip().name)) e.action.fadeOut(0.3);
    });

    /* os de la tête : il suit le curseur du regard */
    model.traverse((o) => {
      if (o.isBone && /Head$/.test(o.name) && !headBone) headBone = o;
    });

    fadeToAction('idle', 0);
    robotReady = true;
    finishPreloader();
    setTimeout(() => { playEmote('agree', true); say('Humain détecté. Bienvenue chez LUMEN.', 3200); }, 1400);
    idleLife();
  },
  (e) => { if (e.total) progress.real = Math.max(progress.real, (e.loaded / e.total) * 95); },
  (err) => { console.error('Androïde introuvable', err); finishPreloader(); }
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
    gsap.fromTo(heroFX.bloom, { strength: 0.38 }, { strength: 0.85, duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.out' });
  }
});

/* pupitre d'émotions */
document.querySelectorAll('.chip[data-emote]').forEach((chip) => {
  chip.addEventListener('click', () => {
    playEmote(chip.dataset.emote);
    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-playing'));
    chip.classList.add('is-playing');
    setTimeout(() => chip.classList.remove('is-playing'), 1600);
    gsap.fromTo(heroFX.bloom, { strength: 0.38 }, { strength: 0.8, duration: 0.3, yoyo: true, repeat: 1, ease: 'power2.out' });
  });
});

/* ═══════════════ SCÈNE MOTEUR : LE DRAGON ═══════════════ */
const dragonCanvas = document.getElementById('dragonCanvas');
/* créée SEULEMENT à l'approche de la section : un 2e contexte WebGL + un
   environnement PMREM au chargement gelaient la page sur machines chargées */
let dragonRenderer = null, dragonScene = null, dragonCamera = null,
    dragonFX = null, dragonGroup = null, dragonKey = null, dragonRim = null;

function initDragonScene() {
  if (dragonRenderer) return;
  dragonRenderer = makeRenderer(dragonCanvas);
  dragonScene = new THREE.Scene();
  dragonScene.fog = new THREE.FogExp2(BG, 0.05);
  const dragonPMREM = new THREE.PMREMGenerator(dragonRenderer);
  dragonScene.environment = dragonPMREM.fromScene(new RoomEnvironment(), 0.04).texture;
  dragonCamera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  dragonCamera.position.set(0, 0.4, 6.2);
  dragonCamera.lookAt(0, 0, 0);
  dragonKey = new THREE.SpotLight(0x22d3ee, 150, 40, Math.PI / 4.5, 0.55, 1.8);
  dragonKey.position.set(4, 6, 5);
  dragonKey.castShadow = true;
  dragonKey.shadow.mapSize.set(1024, 1024);
  dragonKey.shadow.bias = -0.0002;
  dragonScene.add(dragonKey);
  dragonRim = new THREE.PointLight(0xe879f9, 80, 30, 1.6);
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
  dragonFX = makeComposer(dragonRenderer, dragonScene, dragonCamera, 0.5, 0.65, 0.85);
  dragonGroup = new THREE.Group();
  dragonScene.add(dragonGroup);
  layoutDragon();
}
let dragonLoaded = false;

function layoutDragon() {
  if (!dragonRenderer) return;
  const w = dragonCanvas.clientWidth, h = dragonCanvas.clientHeight;
  if (!w || !h) return;
  dragonRenderer.setSize(w, h, false);
  dragonFX.composer.setSize(w, h);
  dragonCamera.aspect = w / h;
  dragonCamera.updateProjectionMatrix();
}

ScrollTrigger.create({
  trigger: '#moteur',
  start: 'top 140%',
  once: true,
  onEnter: () => {
    initDragonScene();
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
    /* teintes froides qui dérivent lentement, respiration rouge au sol */
    spotA.color.setHSL(0.68 + Math.sin(t * 0.06) * 0.06, 0.7, 0.58);
    spotB.color.setHSL(0.54 + Math.sin(t * 0.09 + 2) * 0.05, 0.8, 0.6);
    rimLight.intensity = 36 + Math.sin(t * 1.4) * 12;
    underGlow.intensity = 5 + Math.sin(t * 2.1) * 2.5;
    particlesA.rotation.y = t * 0.02;
    particlesB.rotation.y = -t * 0.014;
    heroFX.composer.render();
  }

  if (dragonVisible && dragonRenderer) {
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
        mask.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:top;margin-bottom:-0.16em;';
        const inner = document.createElement('span');
        inner.className = 'w';
        /* padding haut sur le MOT : les accents des capitales (É, À) dépassent
           la ligne en Anton, et background-clip:text ne peint que dans sa boîte */
        inner.style.cssText = 'display:inline-block;padding-top:0.16em;';
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

let aiProbeDone = false;
async function probeAI() {
  if (aiProbeDone) return;
  aiProbeDone = true;
  const box = document.createElement('div');
  box.id = 'aiDiag';
  box.innerHTML = '<p class="play__pipe">⚙ Diagnostic des moteurs…</p>';
  playOut.prepend(box);
  const lines = [];
  /* 1. API texte */
  try { await llmOnce('ping', 8000); lines.push('<b>✓</b> API texte (pollinations.ai) : OK'); }
  catch (e) { lines.push(`<b>⚠</b> API texte : ${String(e.message || e).slice(0, 60)} → relève par un <b>LLM local dans le navigateur</b> (Qwen 0.5B, téléchargé au 1er usage)`); }
  /* 2. API image */
  try { await loadImage(aiImageUrl('test', 1, 64, 64), 12000); lines.push('<b>✓</b> API image (FLUX) : OK'); }
  catch (e) {
    try { await loadImage(aiImageUrl('test', 1, 64, 64, true), 12000); lines.push('<b>✓</b> API image (passerelle 2) : OK'); }
    catch (e2) { lines.push('<b>⚠</b> API image injoignable → repli en art procédural local'); }
  }
  /* 3. capacités locales, toujours dispo */
  lines.push('<b>✓</b> 3D WebGL, rendu de site, voix : locaux, toujours fonctionnels');
  box.innerHTML = lines.map((l) => `<p class="play__pipe">${l}</p>`).join('');
}

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
  if (view === 'play') probeAI();
}
function closeModal() {
  if (typeof cleanupLiveOutputs === 'function') cleanupLiveOutputs();
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
    playEmote('agree', true);
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

/* ─── GÉNÉRATION RÉELLE ───────────────────────────────────
   Texte / code / analyse : vrais LLM ouverts via l'API libre et
   gratuite text.pollinations.ai (sans clé).
   Image / vidéo : vrai FLUX via image.pollinations.ai.
   Site : HTML généré par le LLM puis RENDU dans la modale.
   3D : objet réel sculpté par le prompt, manipulable à la souris.
   Audio : vraie synthèse vocale (Web Speech) + mélodie Web Audio.
   Si le réseau est coupé (aperçu sandboxé / hors-ligne) : repli
   automatique en démo locale, clairement signalé. ─────────── */

function aiStatusLine(ok) {
  const p = document.createElement('p');
  p.className = 'play__pipe';
  p.innerHTML = ok
    ? '<b>✓</b> IA en ligne — modèles ouverts via <b>pollinations.ai</b>'
    : '<b>⚠</b> Réseau coupé dans cet environnement (aperçu sandboxé&nbsp;?) — repli en démo locale. Sur la version locale ou hébergée, cette génération est réelle.';
  playOut.appendChild(p);
}

/* LLM local : un vrai modèle open source (Qwen 2.5 0.5B) exécuté DANS le
   navigateur via transformers.js — indépendant de toute API distante.
   Téléchargé une fois (~350 Mo), ensuite mis en cache par le navigateur. */
const importUrl = new Function('u', 'return import(u)');
let localLLM = null, localLLMLoading = null;
function ensureLocalLLM(onProgress) {
  if (localLLM) return Promise.resolve(localLLM);
  if (localLLMLoading) return localLLMLoading;
  localLLMLoading = (async () => {
    const { pipeline } = await importUrl('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.1');
    localLLM = await pipeline('text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', {
      dtype: 'q4',
      device: navigator.gpu ? 'webgpu' : 'wasm',
      progress_callback: onProgress,
    });
    return localLLM;
  })();
  localLLMLoading.catch(() => { localLLMLoading = null; });
  return localLLMLoading;
}

async function llmLocal(userPrompt, statusEl) {
  let lastPct = -1;
  const gen = await ensureLocalLLM((p) => {
    if (statusEl && p.status === 'progress' && p.total) {
      const pct = Math.round((p.loaded / p.total) * 100);
      if (pct !== lastPct) {
        lastPct = pct;
        statusEl.innerHTML = `⚙ Téléchargement du modèle local <b>Qwen 2.5 (0.5B)</b> — ${p.file.split('/').pop()} ${pct} % (une seule fois, ensuite en cache)`;
      }
    }
  });
  if (statusEl) statusEl.innerHTML = '⚙ Inférence locale en cours…';
  const messages = [
    { role: 'system', content: 'Tu es LUMEN, une IA francophone concise et utile.' },
    { role: 'user', content: userPrompt },
  ];
  const out = await gen(messages, { max_new_tokens: 220, temperature: 0.7, do_sample: true });
  const last = out[0].generated_text;
  return (Array.isArray(last) ? last[last.length - 1].content : String(last)).trim();
}

async function llmOnce(prompt, timeout, model = 'openai') {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt) + '?model=' + model, { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    let text = (await r.text()).trim();
    /* certaines passerelles renvoient un objet {role, content, reasoning…} brut */
    if (text.startsWith('{')) {
      const j = JSON.parse(text); /* si ça casse → catch → moteur suivant */
      text = (j.content
        || (j.choices && j.choices[0] && (j.choices[0].message && j.choices[0].message.content || j.choices[0].text))
        || (j.message && j.message.content) || '').trim();
    }
    if (!text) throw new Error('réponse vide');
    return text;
  } finally { clearTimeout(timer); }
}
let lastLLMEngine = '';
async function llm(prompt, timeout = 35000, statusEl = null, allowLocal = true) {
  try { const r = await llmOnce(prompt, timeout, 'openai'); lastLLMEngine = 'API pollinations.ai (openai)'; return r; }
  catch (e1) {
    try { const r = await llmOnce(prompt, timeout, 'mistral'); lastLLMEngine = 'API pollinations.ai (mistral)'; return r; }
    catch (e2) {
      /* le modèle local (350 Mo, WASM) peut geler l'onglet sur les longues
         sorties : réservé aux textes courts explicitement autorisés */
      if (!allowLocal) throw e2;
      const r = await llmLocal(prompt, statusEl);
      lastLLMEngine = 'Qwen 2.5 (0.5B) exécuté dans votre navigateur';
      return r;
    }
  }
}

function aiImageUrl(prompt, seed, w = 768, h = 432, alt = false) {
  const host = alt ? 'https://pollinations.ai/p/' : 'https://image.pollinations.ai/prompt/';
  return host + encodeURIComponent(prompt) + `?width=${w}&height=${h}&nologo=true&seed=${seed}`;
}
async function loadAIImage(prompt, seed, w, h, timeout = 60000) {
  try { return await loadImage(aiImageUrl(prompt, seed, w, h, false), timeout); }
  catch (e) { return await loadImage(aiImageUrl(prompt, seed, w, h, true), timeout); }
}

function loadImage(url, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const t = setTimeout(() => { img.src = ''; reject(new Error('timeout')); }, timeout);
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); reject(new Error('chargement')); };
    img.src = url;
  });
}

const stripFences = (s) => s.replace(/^```[a-z]*\s*\n?/i, '').replace(/```\s*$/m, '').trim();

/* traduit + désambiguïse le prompt (ex : « canapé » = sofa, pas l'amuse-bouche) */
async function enhancePrompt(p, cinematic = false) {
  try {
    const out = await llm(`Convert this French image prompt to a precise English image-generation prompt. Resolve ambiguities toward the most common French meaning (ex: "canapé" means sofa furniture, NOT food). Add material/lighting details.${cinematic ? ' Cinematic film still style.' : ''} Answer ONLY the English prompt, max 25 words: "${p}"`, 15000);
    const clean = out.replace(/^["']|["']$/g, '').split('\n')[0].trim();
    return clean.length > 3 ? clean : p;
  } catch (e) { return p; }
}

/* nettoyage des sorties vivantes (3D, vidéo, voix) */
let mini3d = null, vidRaf = 0;
function cleanupLiveOutputs() {
  if (mini3d) {
    cancelAnimationFrame(mini3d.raf);
    if (mini3d.audio) { try { mini3d.audio.ctx.close(); } catch (e) { /* déjà fermé */ } }
    mini3d.renderer.dispose();
    mini3d = null;
  }
  if (vidRaf) { cancelAnimationFrame(vidRaf); vidRaf = 0; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

/* export WAV d'un AudioBuffer (mono) → téléchargeable */
function bufferToWav(buf) {
  const n = buf.length, sr = buf.sampleRate;
  const data = buf.getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); ws(8, 'WAVEfmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, sr, true); out.setUint32(28, sr * 2, true); out.setUint16(32, 2, true);
  out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, data[i])) * 32767, true);
  return new Blob([out.buffer], { type: 'audio/wav' });
}

/* ─── bruitages réellement synthétisés (OfflineAudioContext) ─── */
const SFX_DEFS = {
  aboiement: ['aboi', 'chien', 'bark', 'wouf'],
  tonnerre: ['tonner', 'orage', 'foudre', 'éclair', 'eclair'],
  pluie: ['pluie', 'rain', 'averse'],
  vent: ['vent', 'wind', 'tempête', 'tempete', 'bourrasque'],
  explosion: ['explos', 'bombe', 'boom', 'grenade'],
  laser: ['laser', 'blaster', 'pistolet spatial'],
  sirene: ['sirène', 'sirene', 'alarme', 'police', 'pompier'],
  klaxon: ['klaxon', 'horn'],
  moteur: ['moteur', 'engine', 'accélér', 'acceler', 'vroum'],
  coeur: ['coeur', 'cœur', 'battement', 'cardiaque'],
  applaudissements: ['applaud', 'clap', 'foule', 'ovation'],
  pas: ['bruit de pas', 'footsteps', 'marche dans'],
};
function matchSFX(p) {
  const q = p.toLowerCase();
  for (const k in SFX_DEFS) if (SFX_DEFS[k].some((w) => q.includes(w))) return k;
  return null;
}
function noiseSrc(ctx, dur) {
  const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = b; return src;
}
async function renderSFX(kind) {
  const sr = 44100;
  const DUR = { aboiement: 1.4, tonnerre: 4.5, pluie: 5, vent: 5, explosion: 2.8, laser: 1, sirene: 3.2, klaxon: 1.6, moteur: 3.5, coeur: 2.6, applaudissements: 3.2, pas: 3 }[kind] || 2.5;
  const ctx = new OfflineAudioContext(1, sr * DUR, sr);
  const master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
  const env = (node, t0, a, peak, d) => {
    node.gain.setValueAtTime(0, t0);
    node.gain.linearRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.001, t0 + a + d);
  };
  if (kind === 'aboiement') {
    [0, 0.5].forEach((t0) => {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(420, t0); o.frequency.exponentialRampToValueAtTime(130, t0 + 0.22);
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 750; f.Q.value = 1.2;
      const g = ctx.createGain(); env(g, t0, 0.012, 1, 0.24);
      o.connect(f); f.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.4);
      const n = noiseSrc(ctx, 0.3); const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1600;
      const ng = ctx.createGain(); env(ng, t0, 0.01, 0.35, 0.15);
      n.connect(nf); nf.connect(ng); ng.connect(master); n.start(t0);
    });
  } else if (kind === 'tonnerre') {
    const crack = noiseSrc(ctx, 0.4); const cf = ctx.createBiquadFilter(); cf.type = 'highpass'; cf.frequency.value = 1200;
    const cg = ctx.createGain(); env(cg, 0.02, 0.005, 0.9, 0.35);
    crack.connect(cf); cf.connect(cg); cg.connect(master); crack.start(0);
    const n = noiseSrc(ctx, DUR); const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(400, 0); f.frequency.exponentialRampToValueAtTime(60, DUR);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(1, 0.25);
    for (let t = 0.6; t < DUR - 0.4; t += 0.5) g.gain.linearRampToValueAtTime(0.25 + Math.random() * 0.7, t);
    g.gain.linearRampToValueAtTime(0.001, DUR);
    n.connect(f); f.connect(g); g.connect(master); n.start(0);
  } else if (kind === 'pluie') {
    const n = noiseSrc(ctx, DUR); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 5200; f.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.5;
    n.connect(f); f.connect(g); g.connect(master); n.start(0);
    const n2 = noiseSrc(ctx, DUR); const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 900;
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    n2.connect(f2); f2.connect(g2); g2.connect(master); n2.start(0);
  } else if (kind === 'vent') {
    const n = noiseSrc(ctx, DUR); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(300, 0);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.16;
    const lg = ctx.createGain(); lg.gain.value = 220;
    lfo.connect(lg); lg.connect(f.frequency); lfo.start(0);
    const g = ctx.createGain(); g.gain.value = 0.7;
    n.connect(f); f.connect(g); g.connect(master); n.start(0);
  } else if (kind === 'explosion') {
    const n = noiseSrc(ctx, DUR); const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, 0); f.frequency.exponentialRampToValueAtTime(70, DUR * 0.8);
    const g = ctx.createGain(); env(g, 0, 0.008, 1, DUR * 0.85);
    n.connect(f); f.connect(g); g.connect(master); n.start(0);
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(35, 0.9);
    const og = ctx.createGain(); env(og, 0, 0.01, 0.9, 1.1);
    o.connect(og); og.connect(master); o.start(0); o.stop(1.4);
  } else if (kind === 'laser') {
    [0, 0.45].forEach((t0) => {
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.setValueAtTime(2100, t0); o.frequency.exponentialRampToValueAtTime(90, t0 + 0.3);
      const g = ctx.createGain(); env(g, t0, 0.005, 0.6, 0.3);
      o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.4);
    });
  } else if (kind === 'sirene') {
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 720;
    const lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 0.55;
    const lg = ctx.createGain(); lg.gain.value = 190;
    lfo.connect(lg); lg.connect(o.frequency); lfo.start(0);
    const g = ctx.createGain(); g.gain.value = 0.5;
    o.connect(g); g.connect(master); o.start(0);
  } else if (kind === 'klaxon') {
    [0, 0.75].forEach((t0, i) => {
      [440, 554].forEach((fr) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr;
        const g = ctx.createGain(); env(g, t0, 0.02, 0.35, i ? 0.6 : 0.35);
        o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.8);
      });
    });
  } else if (kind === 'moteur') {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, 0); o.frequency.exponentialRampToValueAtTime(210, DUR);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 27;
    const lg = ctx.createGain(); lg.gain.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0.5;
    lfo.connect(lg); lg.connect(g.gain); lfo.start(0);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
    o.connect(f); f.connect(g); g.connect(master); o.start(0);
  } else if (kind === 'coeur') {
    [0, 0.28, 1.0, 1.28, 2.0].forEach((t0, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = i % 2 ? 42 : 55;
      const g = ctx.createGain(); env(g, t0, 0.015, 0.9, 0.22);
      o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.35);
    });
  } else if (kind === 'applaudissements') {
    for (let i = 0; i < 220; i++) {
      const t0 = Math.random() * (DUR - 0.1);
      const n = noiseSrc(ctx, 0.05); const f = ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = 1500 + Math.random() * 2500;
      const g = ctx.createGain(); env(g, t0, 0.002, 0.12 + Math.random() * 0.12, 0.05);
      n.connect(f); f.connect(g); g.connect(master); n.start(t0);
    }
  } else if (kind === 'pas') {
    for (let i = 0; i < 6; i++) {
      const t0 = i * 0.48;
      const n = noiseSrc(ctx, 0.12); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      const g = ctx.createGain(); env(g, t0, 0.004, 0.7, 0.1);
      n.connect(f); f.connect(g); g.connect(master); n.start(t0);
    }
  } else {
    const o = ctx.createOscillator(); o.frequency.value = 220;
    const g = ctx.createGain(); env(g, 0, 0.02, 0.5, DUR * 0.8);
    o.connect(g); g.connect(master); o.start(0);
  }
  return await ctx.startRendering();
}

/* instru hip-hop seedée, rendue hors-ligne (→ téléchargeable) */
async function renderBeat(rng, bars = 8) {
  const sr = 44100, bpm = 88, beat = 60 / bpm, dur = bars * 4 * beat + 0.5;
  const ctx = new OfflineAudioContext(1, sr * dur, sr);
  const master = ctx.createGain(); master.gain.value = 0.85; master.connect(ctx.destination);
  const bassNotes = [55, 55, 65.4, 49].map((f) => f * (rng() < 0.5 ? 1 : 1.5));
  for (let bar = 0; bar < bars; bar++) {
    for (let step = 0; step < 4; step++) {
      const t0 = (bar * 4 + step) * beat;
      /* kick sur 1 et 3 (+ variation) */
      if (step === 0 || step === 2 || rng() < 0.15) {
        const o = ctx.createOscillator(); o.frequency.setValueAtTime(120, t0); o.frequency.exponentialRampToValueAtTime(38, t0 + 0.12);
        const g = ctx.createGain(); g.gain.setValueAtTime(1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.22);
        o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.3);
      }
      /* snare sur 2 et 4 */
      if (step === 1 || step === 3) {
        const n = noiseSrc(ctx, 0.15); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14);
        n.connect(f); f.connect(g); g.connect(master); n.start(t0);
      }
      /* hi-hats en croches */
      for (let h = 0; h < 2; h++) {
        const th = t0 + h * beat / 2;
        const n = noiseSrc(ctx, 0.04); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
        const g = ctx.createGain(); g.gain.setValueAtTime(h ? 0.1 : 0.18, th); g.gain.exponentialRampToValueAtTime(0.001, th + 0.04);
        n.connect(f); f.connect(g); g.connect(master); n.start(th);
      }
    }
    /* basse : une note par mesure */
    const bf = bassNotes[bar % 4];
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = bf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    const g = ctx.createGain(); const t0 = bar * 4 * beat;
    g.gain.setValueAtTime(0.4, t0); g.gain.setValueAtTime(0.4, t0 + 4 * beat - 0.1); g.gain.linearRampToValueAtTime(0, t0 + 4 * beat);
    o.connect(f); f.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 4 * beat);
  }
  return await ctx.startRendering();
}

/* lecteur + bouton de téléchargement pour un AudioBuffer rendu */
function audioResult(buf, filename, note) {
  const blob = bufferToWav(buf);
  const url = URL.createObjectURL(blob);
  const player = document.createElement('audio');
  player.controls = true; player.src = url; player.style.cssText = 'width:100%;margin-top:0.8rem;';
  playOut.appendChild(player);
  const dl = document.createElement('a');
  dl.className = 'chip play__replay';
  dl.textContent = '⬇ Télécharger (.wav)';
  dl.href = url; dl.download = filename;
  playOut.appendChild(dl);
  if (note) { const m = document.createElement('p'); m.className = 'play__meta'; m.textContent = note; playOut.appendChild(m); }
  player.play().catch(() => {});
  return player;
}

/* TTS distant téléchargeable (openai-audio via pollinations), sinon voix navigateur */
async function ttsDownloadable(text) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch('https://text.pollinations.ai/' + encodeURIComponent(text) + '?model=openai-audio&voice=alloy', { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const type = r.headers.get('content-type') || '';
    if (!type.includes('audio')) throw new Error('pas de flux audio');
    return await r.blob();
  } finally { clearTimeout(t); }
}

function speak(text) {
  if (!('speechSynthesis' in window)) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR'; u.rate = 1.02; u.pitch = 0.75; /* voix grave d'androïde */
  const voices = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.startsWith('fr'));
  if (voices.length) u.voice = voices[0];
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  return true;
}

/* bibliothèque de vrais modèles GLB open source (Khronos / Wayfair) */
const LIB3D = [
  { keys: ['robot', 'androide', 'androïde', 'cyborg', 'droïde', 'droide', 'mecha'], file: 'assets/models/Xbot.glb', name: 'Robot humanoïde', size: 2.0, kind: 'humanoid' },
  { keys: ['humain', 'homme', 'femme', 'personne', 'personnage', 'soldat', 'humanoide', 'humanoïde', 'avatar', 'character', 'joueur', 'perso', 'héros', 'heros', 'realiste', 'réaliste'], file: 'assets/models/lib/Soldier.glb', name: 'Humain réaliste (soldat)', size: 2.0, kind: 'humanoid' },
  { keys: ['canap', 'sofa', 'divan', 'banquette'], file: '../assets/models/GlamVelvetSofa.glb', name: 'Canapé en velours', size: 1.9 },
  { keys: ['chaise', 'fauteuil', 'chair', 'siège', 'siege', 'assise'], file: '../assets/models/SheenChair.glb', name: 'Fauteuil bouclé', size: 1.8 },
  { keys: ['voiture', 'auto', 'car', 'bagnole', 'vehicule', 'véhicule', 'gta', 'course', 'racing', 'taxi', 'route', 'conduite', 'drift'], file: 'assets/models/lib/ToyCar.glb', name: 'Voiture', size: 1.9, kind: 'car' },
  { keys: ['canard', 'duck', 'oiseau', 'poule'], file: 'assets/models/lib/Duck.glb', name: 'Canard', size: 1.7 },
  { keys: ['casque', 'helmet', 'armure', 'soldat', 'guerrier', 'cyber', 'space', 'astronaute', 'combat', 'fps', 'guerre'], file: 'assets/models/lib/DamagedHelmet.glb', name: 'Casque sci-fi', size: 1.8 },
  { keys: ['bouteille', 'bottle', 'gourde', 'eau', 'boisson'], file: 'assets/models/lib/WaterBottle.glb', name: 'Bouteille', size: 1.7 },
  { keys: ['dragon', 'creature', 'créature', 'monstre'], file: 'assets/models/DragonAttenuation.glb', name: 'Dragon de verre', size: 1.9, kind: 'dragon' },
  { keys: ['loup', 'louve'], file: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb', name: 'Loup (approché : renard animé recoloré gris — pas de loup dans les bibliothèques GLB libres)', size: 1.9, kind: 'humanoid', tint: 0x8d97a8 },
  { keys: ['renard', 'fox', 'chien', 'animal'], file: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/glTF-Binary/Fox.glb', name: 'Renard (animal animé)', size: 1.9, kind: 'humanoid' },
];
const LIB3D_WORDS = { robot: 0, human: 1, sofa: 2, chair: 3, car: 4, duck: 5, helmet: 6, bottle: 7, dragon: 8, fox: 10 };

function matchLib3D(prompt) {
  const p = prompt.toLowerCase();
  return LIB3D.find((e) => e.keys.some((k) => p.includes(k))) || null;
}

async function classifyLib3D(prompt) {
  try {
    const out = (await llm(`Pick the ONE physical object that best represents "${prompt}" for a 3D model. Use associations: "GTA/course/ville" → car, "guerre/soldat/sci-fi" → helmet, "fantasy/créature" → dragon, "salon/meuble" → sofa or chair, "boisson" → bottle, "animal/oiseau" → duck. Options: robot, human, sofa, chair, car, duck, fox, helmet, bottle, dragon, abstract. ("robot/android" → robot ; "humain/personnage" → human ; "loup/renard/chien/animal terrestre" → fox ; duck SEULEMENT pour canard/oiseau.) Answer ONLY one word.`, 12000, null, false)).toLowerCase();
    for (const w in LIB3D_WORDS) if (out.includes(w)) return LIB3D[LIB3D_WORDS[w]];
  } catch (e) { /* pas grave */ }
  return null;
}

/* catalogue complet Khronos, récupéré en direct (≈60 vrais GLB) */
let catalogPromise = null;
function fetchCatalog() {
  if (catalogPromise) return catalogPromise;
  catalogPromise = (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/model-index.json', { signal: ctrl.signal });
    clearTimeout(t);
    const idx = await r.json();
    const bad = /Test|Compare|Box|Cube|Interleaved|Unicode|Morph|Simple|Triangle|Unlit|NonPowerOfTwo|VertexColors|AnimationPointer|MultiUV|MultipleScenes|NegativeScale|NodePerformance|RecursiveSkeletons|TextureCoordinate|TextureEncoding|TextureLinear|TextureSettings|TextureTransform|PrimitiveMode|Xmp|Rigged|Pointer|Accessor|Instancing|Interpolation/i;
    const cat = idx
      .filter((m) => m.variants && m.variants['glTF-Binary'] && !bad.test(m.name))
      .map((m) => ({ id: m.name, file: `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/${m.name}/glTF-Binary/${m.variants['glTF-Binary']}` }));
    /* extras locaux : humains/robots riggés */
    cat.unshift(
      { id: 'Soldier', file: 'assets/models/lib/Soldier.glb', label: 'humain réaliste animé' },
      { id: 'Xbot', file: 'assets/models/Xbot.glb', label: 'robot humanoïde animé' }
    );
    return cat;
  })();
  catalogPromise.catch(() => { catalogPromise = null; });
  return catalogPromise;
}

function used3D() { try { return JSON.parse(localStorage.getItem('lumen-used-3d') || '[]'); } catch (e) { return []; } }
function markUsed3D(id) {
  const u = used3D().filter((x) => x !== id);
  u.push(id);
  localStorage.setItem('lumen-used-3d', JSON.stringify(u.slice(-25)));
}

async function pickFromCatalog(prompt) {
  const cat = await fetchCatalog();
  const names = cat.map((c) => c.id + (c.label ? ` (${c.label})` : '')).join(', ');
  const used = used3D();
  const out = await llm(`Tu choisis un modèle 3D dans un catalogue pour illustrer : "${prompt}". Catalogue : ${names}. ${used.length ? `Déjà montrés (à éviter si une alternative pertinente existe) : ${used.join(', ')}.` : ''} Le modèle doit REPRÉSENTER le sujet demandé. Exemples : "un loup"→Fox, "une voiture réaliste"→CarConcept, "un humain"→Soldier, "un robot"→Xbot, "un échiquier"→ABeautifulGame, "une montre"→ChronographWatch, "un poisson"→BarramundiFish. Ne choisis JAMAIS un modèle sans rapport. Réponds UNIQUEMENT le nom exact du modèle, ou NONE si rien ne correspond.`, 15000, null, false);
  const word = out.trim().split(/[\s,.;:!]/)[0].toLowerCase();
  if (word === 'none') return null;
  return cat.find((c) => c.id.toLowerCase() === word) ||
         cat.find((c) => out.toLowerCase().includes(c.id.toLowerCase())) || null;
}

function loadGLB(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeout);
    loader.load(url, (g) => { clearTimeout(t); resolve(g); }, undefined, (e) => { clearTimeout(t); reject(e); });
  });
}

/* objet 3D réel, manipulable — modèle GLB fourni, sinon forme sculptée */
function spawnMini3d(rng, model3d = null, modelSize = 1.8, anims = null) {
  const canvas = document.createElement('canvas');
  canvas.className = 'play__mini3d';
  playOut.appendChild(canvas);
  const W = Math.max(playOut.clientWidth - 4, 320), H = 280;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.environment = heroScene.environment;
  const cam = new THREE.PerspectiveCamera(38, W / H, 0.1, 50);
  cam.position.set(0, 0.3, 3.3);
  scene.add(new THREE.AmbientLight(0x404060, 2));
  const l1 = new THREE.PointLight(0x22d3ee, 40, 20); l1.position.set(3, 2, 3); scene.add(l1);
  const l2 = new THREE.PointLight(0xe879f9, 40, 20); l2.position.set(-3, -1, 2); scene.add(l2);

  let mesh, wire = null, tris = 0;
  if (model3d) {
    /* vrai GLB : centré et mis à l'échelle */
    mesh = model3d;
    mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(mesh);
    const sz = box.getSize(new THREE.Vector3());
    const ctr = box.getCenter(new THREE.Vector3());
    const sc = modelSize / Math.max(sz.x, sz.y, sz.z);
    mesh.scale.setScalar(sc);
    mesh.position.set(-ctr.x * sc, -ctr.y * sc, -ctr.z * sc);
    const pivot = new THREE.Group();
    pivot.add(mesh);
    scene.add(pivot);
    mesh = pivot;
    model3d.traverse((o) => { if (o.isMesh && o.geometry) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  } else {
    const geo = new THREE.IcosahedronGeometry(1, 16);
    const posAttr = geo.attributes.position;
    const v = new THREE.Vector3();
    const f1 = 1.5 + rng() * 3.5, f2 = 1.5 + rng() * 4.5, amp = 0.12 + rng() * 0.24;
    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i);
      const d = 1 + amp * Math.sin(v.x * f1 + v.y * f2) * Math.cos(v.z * f2 - v.y * f1);
      v.normalize().multiplyScalar(d);
      posAttr.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color().setHSL(rng(), 0.7, 0.55),
      metalness: 0.45, roughness: 0.22, clearcoat: 0.8,
    });
    mesh = new THREE.Mesh(geo, mat);
    wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x22d3ee, wireframe: true, transparent: true, opacity: 0.07 }));
    wire.scale.setScalar(1.003);
    scene.add(mesh, wire);
    tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
  }

  let dragging = false, lx = 0, vx = 0;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; lx = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lx; lx = e.clientX; vx = dx * 0.005;
    mesh.rotation.y += dx * 0.005;
  });
  canvas.addEventListener('pointerup', () => { dragging = false; });

  let miniMixer = null;
  if (anims && anims.length && model3d) {
    miniMixer = new THREE.AnimationMixer(model3d);
    const clip = anims.find((a) => /idle/i.test(a.name)) || anims[0];
    miniMixer.clipAction(clip).play();
  }
  let lastT = performance.now();
  mini3d = { renderer, raf: 0 };
  const tick3d = () => {
    if (!mini3d) return;
    const nowT = performance.now();
    if (miniMixer) miniMixer.update(Math.min((nowT - lastT) / 1000, 0.05));
    lastT = nowT;
    if (!dragging) { vx *= 0.95; mesh.rotation.y += 0.006 + vx; }
    mesh.rotation.x = Math.sin(performance.now() * 0.0004) * (model3d ? 0.08 : 0.22);
    if (wire) wire.rotation.copy(mesh.rotation);
    renderer.render(scene, cam);
    mini3d.raf = requestAnimationFrame(tick3d);
  };
  tick3d();
  return { triangles: Math.round(tris) };
}

/* ═══ CINÉMATIQUE 3D TEMPS RÉEL v2 : map thématisée par l'IA, relief,
   police, tirs, explosions, son moteur/sirène synthétisé en direct ═══ */

const CINE_THEMES = {
  ville:  { sky: 0x07051a, fogD: 0.03,  ground: 0x0a0716, grid: 0x22d3ee, gridOp: 0.14, buildings: 46, mountains: 0x14102a, trees: 0, snow: false, stars: false },
  desert: { sky: 0x150d06, fogD: 0.022, ground: 0x2e2213, grid: 0xffa94d, gridOp: 0.05, buildings: 6,  mountains: 0x3a2c18, trees: 0, snow: false, stars: true },
  foret:  { sky: 0x061206, fogD: 0.035, ground: 0x08150a, grid: 0x3ddc84, gridOp: 0.05, buildings: 0,  mountains: 0x0c2212, trees: 46, snow: false, stars: false },
  neige:  { sky: 0x0a0e18, fogD: 0.028, ground: 0x8da3ba, grid: 0xffffff, gridOp: 0.06, buildings: 8,  mountains: 0xbfcede, trees: 26, snow: true, stars: false },
  espace: { sky: 0x02020a, fogD: 0.008, ground: 0x0a0716, grid: 0x8b5cf6, gridOp: 0.2,  buildings: 0,  mountains: 0x14102a, trees: 0, snow: false, stars: true, crystals: 18 },
};

async function cineTheme(prompt) {
  const kw = prompt.toLowerCase();
  let amb = /d[ée]sert|sable|dune/.test(kw) ? 'desert'
    : /for[êe]t|jungle|bois|nature/.test(kw) ? 'foret'
    : /neige|hiver|glace|ski/.test(kw) ? 'neige'
    : /espace|galax|lune|mars|cosmos/.test(kw) ? 'espace' : null;
  if (!amb) {
    try {
      const t = await llm(`Quel décor convient à "${prompt}" ? Réponds UN mot parmi : ville, desert, foret, neige, espace.`, 9000, null, false);
      const w = t.toLowerCase();
      amb = ['ville', 'desert', 'foret', 'neige', 'espace'].find((a) => w.includes(a)) || 'ville';
    } catch (e) { amb = 'ville'; }
  }
  return amb;
}

/* moteur sonore temps réel de la cinématique (fermé par cleanupLiveOutputs) */
function cineSound(kind, fx) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC();
  const master = ctx.createGain(); master.gain.value = 0.4; master.connect(ctx.destination);
  const nb = (dur) => {
    const b = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  };
  /* vent d'ambiance */
  const wind = ctx.createBufferSource(); wind.buffer = nb(2); wind.loop = true;
  const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 340; wf.Q.value = 0.7;
  const wg = ctx.createGain(); wg.gain.value = 0.1;
  wind.connect(wf); wf.connect(wg); wg.connect(master); wind.start();

  const out = { ctx, muted: false };
  out.toggle = () => { out.muted = !out.muted; master.gain.value = out.muted ? 0 : 0.4; return out.muted; };

  if (kind === 'car') {
    const eng = ctx.createOscillator(); eng.type = 'sawtooth'; eng.frequency.value = 65;
    const sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 33;
    const ef = ctx.createBiquadFilter(); ef.type = 'lowpass'; ef.frequency.value = 700;
    const eg = ctx.createGain(); eg.gain.value = 0.25;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 26;
    const lg = ctx.createGain(); lg.gain.value = 0.12;
    lfo.connect(lg); lg.connect(eg.gain); lfo.start();
    eng.connect(ef); sub.connect(ef); ef.connect(eg); eg.connect(master);
    eng.start(); sub.start();
    out.setSpeed = (v) => { eng.frequency.value = 55 + v * 140; sub.frequency.value = 28 + v * 40; };
  } else { out.setSpeed = () => {}; }

  if (fx.police) {
    const si = ctx.createOscillator(); si.type = 'triangle'; si.frequency.value = 680;
    const sl = ctx.createOscillator(); sl.type = 'triangle'; sl.frequency.value = 0.9;
    const slg = ctx.createGain(); slg.gain.value = 170;
    sl.connect(slg); slg.connect(si.frequency); sl.start();
    const sg = ctx.createGain(); sg.gain.value = 0.07;
    si.connect(sg); sg.connect(master); si.start();
  }
  out.boom = () => {
    const t0 = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = nb(1.4);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(2400, t0); f.frequency.exponentialRampToValueAtTime(80, t0 + 1);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.2);
    n.connect(f); f.connect(g); g.connect(master); n.start(t0);
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(32, t0 + 0.7);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.8, t0); og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.9);
    o.connect(og); og.connect(master); o.start(t0); o.stop(t0 + 1);
  };
  out.shot = () => {
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(1400, t0); o.frequency.exponentialRampToValueAtTime(220, t0 + 0.07);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.22, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
    o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.12);
  };
  return out;
}

async function cinematic3D(prompt, rng, entry) {
  const kw = prompt.toLowerCase();
  const fx = {
    police: /police|flic|poursuite|gendarm/.test(kw),
    guns: /arme|tir|fusil|gun|shoot|fusillade|mitraill/.test(kw),
    explosions: /explos|bombe|boom|d[ée]tonation/.test(kw),
    race: /course|racing|vitesse|rapide|drift|gta/.test(kw),
  };
  const amb = await cineTheme(prompt);
  const T = CINE_THEMES[amb];

  const wrap = document.createElement('div');
  wrap.className = 'play__cine';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  const barT = document.createElement('div'); barT.className = 'cine-bar cine-bar--t';
  const barB = document.createElement('div'); barB.className = 'cine-bar cine-bar--b';
  const label = document.createElement('span'); label.className = 'cine-label';
  const muteBtn = document.createElement('button'); muteBtn.className = 'cine-mute'; muteBtn.textContent = '🔊';
  wrap.appendChild(barT); wrap.appendChild(barB); wrap.appendChild(label); wrap.appendChild(muteBtn);
  playOut.appendChild(wrap);

  const W = Math.max(playOut.clientWidth - 4, 320), H = Math.round(W * 9 / 16);
  wrap.style.height = H + 'px';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(T.sky);
  scene.fog = new THREE.FogExp2(T.sky, T.fogD);
  scene.environment = heroScene.environment;
  const cam = new THREE.PerspectiveCamera(40, W / H, 0.1, 300);

  /* sol + grille */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: T.ground, metalness: amb === 'neige' ? 0.1 : 0.7, roughness: amb === 'neige' ? 0.9 : 0.45 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(400, 110, T.grid, T.grid);
  grid.material.transparent = true; grid.material.opacity = T.gridOp;
  scene.add(grid);

  /* relief : couronne de montagnes low-poly */
  for (let i = 0; i < 26; i++) {
    const h = 8 + rng() * 22, r = 7 + rng() * 13;
    const m = new THREE.Mesh(
      new THREE.ConeGeometry(r, h, 5 + Math.floor(rng() * 3)),
      new THREE.MeshStandardMaterial({ color: T.mountains, flatShading: true, metalness: 0.15, roughness: 0.9 })
    );
    const ang = rng() * Math.PI * 2, dist = 55 + rng() * 60;
    m.position.set(Math.cos(ang) * dist, h / 2 - 0.2, Math.sin(ang) * dist);
    m.rotation.y = rng() * Math.PI;
    scene.add(m);
  }
  /* immeubles / arbres / cristaux selon l'ambiance */
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < T.buildings; i++) {
    const bw = 2 + rng() * 4, bh = 3 + rng() * 14, bd = 2 + rng() * 4;
    const b = new THREE.Mesh(bGeo, new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.7 + rng() * 0.1, 0.3, 0.09 + rng() * 0.06),
      emissive: new THREE.Color().setHSL(rng() < 0.5 ? 0.55 : 0.83, 0.8, 0.1),
      metalness: 0.5, roughness: 0.6,
    }));
    b.scale.set(bw, bh, bd);
    const ang = rng() * Math.PI * 2, dist = 17 + rng() * 34;
    b.position.set(Math.cos(ang) * dist, bh / 2, Math.sin(ang) * dist);
    b.castShadow = true;
    scene.add(b);
  }
  for (let i = 0; i < (T.trees || 0); i++) {
    const h = 2.2 + rng() * 3.5;
    const tr = new THREE.Mesh(
      new THREE.ConeGeometry(0.8 + rng() * 0.8, h, 7),
      new THREE.MeshStandardMaterial({ color: amb === 'neige' ? 0xdde7f0 : 0x1c4d28, flatShading: true, roughness: 0.9 })
    );
    const ang = rng() * Math.PI * 2, dist = 16 + rng() * 32;
    tr.position.set(Math.cos(ang) * dist, h / 2, Math.sin(ang) * dist);
    tr.castShadow = true;
    scene.add(tr);
  }
  for (let i = 0; i < (T.crystals || 0); i++) {
    const c = new THREE.Mesh(
      new THREE.OctahedronGeometry(1 + rng() * 2.2),
      new THREE.MeshStandardMaterial({ color: 0x8b5cf6, emissive: 0x4c1d95, metalness: 0.8, roughness: 0.2, flatShading: true })
    );
    const ang = rng() * Math.PI * 2, dist = 15 + rng() * 35;
    c.position.set(Math.cos(ang) * dist, 1.5 + rng() * 6, Math.sin(ang) * dist);
    scene.add(c);
  }
  if (T.snow) { const sn = makeParticles(700, 60, 0.09, 0xffffff); sn.position.y = 10; scene.add(sn); scene.userData.snow = sn; }
  if (T.stars) { const st = makeParticles(500, 160, 0.25, 0xbfd8ff); st.position.y = 60; scene.add(st); }

  const key = new THREE.SpotLight(0xbfd8ff, 250, 160, Math.PI / 4, 0.5, 1.4);
  key.position.set(18, 34, 12); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  scene.add(new THREE.AmbientLight(0x201a38, amb === 'neige' ? 4 : 2.4));
  const neonA = new THREE.PointLight(0x22d3ee, 120, 60, 1.6); neonA.position.set(-12, 4, -8); scene.add(neonA);
  const neonB = new THREE.PointLight(0xe879f9, 120, 60, 1.6); neonB.position.set(12, 4, 8); scene.add(neonB);

  /* acteur (podium ToyCar retiré) */
  const g = await loadGLB(entry.file);
  const rm = [];
  g.scene.traverse((o) => {
    if (/cloth|backdrop/i.test(o.name) || (/ToyCar/.test(entry.file) && /^(fabric|glass)$/i.test(o.name))) rm.push(o);
    if (o.isMesh) o.castShadow = true;
  });
  rm.forEach((o) => o.parent && o.parent.remove(o));
  if (entry.tint) g.scene.traverse((o) => {
    if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.color.set(entry.tint); }
  });
  const actorSize = entry.kind === 'car' ? 3.2 : entry.kind === 'humanoid' ? 1.9 : 2.6;
  const inner = g.scene;
  if (entry.kind === 'humanoid') inner.rotation.y = Math.PI; /* Mixamo regarde -Z : sinon il court à l'envers */
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner);
  const sz = box.getSize(new THREE.Vector3()); const ctr = box.getCenter(new THREE.Vector3());
  const sc = actorSize / Math.max(sz.x, sz.y, sz.z);
  inner.scale.setScalar(sc);
  inner.position.set(-ctr.x * sc, -box.min.y * sc, -ctr.z * sc);
  const actor = new THREE.Group();
  actor.add(inner);
  scene.add(actor);
  let mixer = null;
  if (g.animations && g.animations.length) {
    mixer = new THREE.AnimationMixer(inner);
    const run = g.animations.find((a) => /run/i.test(a.name)) || g.animations.find((a) => /walk|idle/i.test(a.name)) || g.animations[0];
    mixer.clipAction(run).play();
  }

  /* voiture de police en poursuite */
  let police = null, lightR = null, lightB = null;
  if (fx.police) {
    police = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 0.45, 2.1), new THREE.MeshStandardMaterial({ color: 0x0f1e4d, metalness: 0.7, roughness: 0.35 }));
    body.position.y = 0.45; police.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 1), new THREE.MeshStandardMaterial({ color: 0xd8e2f0, metalness: 0.4, roughness: 0.3 }));
    cab.position.set(0, 0.82, -0.1); police.add(cab);
    [[-0.5, 0.75], [0.5, 0.75], [-0.5, -0.75], [0.5, -0.75]].forEach(([wx, wz]) => {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.9 }));
      wh.rotation.z = Math.PI / 2;
      wh.position.set(wx, 0.22, wz);
      police.add(wh);
    });
    const barGeo = new THREE.BoxGeometry(0.22, 0.1, 0.22);
    const mR = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2222, emissiveIntensity: 2 });
    const mB = new THREE.MeshStandardMaterial({ color: 0x000033, emissive: 0x2244ff, emissiveIntensity: 2 });
    const gyR = new THREE.Mesh(barGeo, mR); gyR.position.set(-0.16, 1.05, -0.1); police.add(gyR);
    const gyB = new THREE.Mesh(barGeo, mB); gyB.position.set(0.16, 1.05, -0.1); police.add(gyB);
    lightR = new THREE.PointLight(0xff2222, 0, 14, 1.8); lightR.position.set(0, 1.4, 0); police.add(lightR);
    lightB = new THREE.PointLight(0x2244ff, 0, 14, 1.8); lightB.position.set(0, 1.4, 0.1); police.add(lightB);
    police.userData = { gyR: mR, gyB: mB };
    police.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(police);
  }

  /* traceurs de tirs + explosions */
  const tracer = fx.guns ? new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 1, 6),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0 })
  ) : null;
  if (tracer) scene.add(tracer);
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0 })
  );
  const flameLight = new THREE.PointLight(0xff7722, 0, 40, 1.6);
  scene.add(flame); scene.add(flameLight);

  const sound = cineSound(entry.kind, fx);
  muteBtn.addEventListener('click', () => { muteBtn.textContent = sound.toggle() ? '🔇' : '🔊'; });

  /* trajectoire + plans caméra */
  const SHOT_LEN = 3.4, SHOTS_N = 4;
  const speedMul = fx.race ? 1.35 : 1;
  const pathPos = (t) => {
    const w = (entry.kind === 'car' ? 0.55 : entry.kind === 'humanoid' ? 0.35 : 0.3) * speedMul;
    const rx = entry.kind === 'car' ? 11 : 7, rz = 7;
    const y = entry.kind === 'dragon' ? 3 + Math.sin(t * 1.1) * 1.2 : 0;
    return new THREE.Vector3(Math.cos(t * w) * rx, y, Math.sin(t * w * (entry.kind === 'car' ? 1.6 : 1)) * rz);
  };
  const start = performance.now();
  let lastT = start, nextBoom = 2.5, nextShot = 1.2, boomAge = 99;
  mini3d = { renderer, raf: 0, audio: sound };
  const _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _pp = new THREE.Vector3(), _pp2 = new THREE.Vector3();
  const tickCine = () => {
    if (!mini3d) return;
    const now = performance.now();
    const t = (now - start) / 1000;
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    if (mixer) mixer.update(dt * speedMul);
    _p.copy(pathPos(t)); _p2.copy(pathPos(t + 0.06));
    actor.position.copy(_p);
    actor.lookAt(_p2.x, _p.y, _p2.z);
    const speed = _p2.distanceTo(_p) / 0.06;
    sound.setSpeed(Math.min(speed / 8, 1));
    if (entry.kind === 'car') {
      const drift = Math.sin(t * 1.7) * 0.4;
      actor.rotation.y += drift;
      inner.rotation.z = Math.sin(t * 1.7) * 0.07;
    }
    /* police : 0.55 s derrière, gyrophares alternés */
    if (police) {
      _pp.copy(pathPos(t - 0.55)); _pp2.copy(pathPos(t - 0.49));
      police.position.copy(_pp);
      police.lookAt(_pp2.x, _pp.y, _pp2.z);
      const blink = Math.floor(t * 6) % 2;
      police.userData.gyR.emissiveIntensity = blink ? 4 : 0.3;
      police.userData.gyB.emissiveIntensity = blink ? 0.3 : 4;
      lightR.intensity = blink ? 60 : 0;
      lightB.intensity = blink ? 0 : 60;
    }
    /* tirs traceurs police → acteur */
    if (tracer && police && t > nextShot) {
      nextShot = t + 0.5 + rng() * 0.9;
      sound.shot();
      tracer.material.opacity = 1;
      const from = police.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      const to = actor.position.clone().add(new THREE.Vector3((rng() - 0.5) * 1.4, 0.7, (rng() - 0.5) * 1.4));
      const mid = from.clone().lerp(to, 0.5);
      tracer.position.copy(mid);
      tracer.scale.y = from.distanceTo(to);
      tracer.lookAt(to);
      tracer.rotateX(Math.PI / 2);
    }
    if (tracer) tracer.material.opacity *= 0.82;
    /* explosions */
    if (fx.explosions && t > nextBoom) {
      nextBoom = t + 2.2 + rng() * 1.8;
      boomAge = 0;
      const bp = pathPos(t + 0.5).add(new THREE.Vector3((rng() - 0.5) * 10, 0.5, (rng() - 0.5) * 10));
      flame.position.copy(bp); flameLight.position.copy(bp);
      sound.boom();
    }
    boomAge += dt;
    if (boomAge < 1) {
      flame.scale.setScalar(0.4 + boomAge * 5);
      flame.material.opacity = Math.max(0, 0.85 - boomAge);
      flameLight.intensity = Math.max(0, 300 * (1 - boomAge));
    } else { flame.material.opacity = 0; flameLight.intensity = 0; }
    /* neige qui tombe */
    if (scene.userData.snow) { scene.userData.snow.position.y -= dt * 1.2; if (scene.userData.snow.position.y < 2) scene.userData.snow.position.y = 10; }
    /* plans caméra */
    const shot = Math.floor(t / SHOT_LEN) % SHOTS_N;
    const st = (t % SHOT_LEN) / SHOT_LEN;
    const heading = Math.atan2(_p2.x - _p.x, _p2.z - _p.z);
    if (shot === 0) {
      cam.position.set(_p.x - Math.sin(heading) * 6, _p.y + 2.2, _p.z - Math.cos(heading) * 6);
    } else if (shot === 1) {
      cam.position.set(_p.x + Math.cos(heading) * 4.5, _p.y + 0.7, _p.z - Math.sin(heading) * 4.5);
    } else if (shot === 2) {
      const ahead = pathPos(Math.floor(t / SHOT_LEN) * SHOT_LEN + SHOT_LEN * 0.7);
      cam.position.set(ahead.x, 0.5, ahead.z + 2.5);
    } else {
      cam.position.set(Math.cos(t * 0.15) * 13, 6 + st * 2.5, Math.sin(t * 0.15) * 13);
    }
    cam.lookAt(_p.x, _p.y + 0.8, _p.z);
    const fxTags = [fx.police && 'POLICE', fx.guns && 'TIRS', fx.explosions && 'EXPLOSIONS'].filter(Boolean).join(' · ');
    label.textContent = `PLAN ${shot + 1}/${SHOTS_N} · ${amb.toUpperCase()}${fxTags ? ' · ' + fxTags : ''} · 3D TEMPS RÉEL`;
    neonA.intensity = 110 + Math.sin(t * 2.4) * 40;
    neonB.intensity = 110 + Math.cos(t * 1.9) * 40;
    renderer.render(scene, cam);
    mini3d.raf = requestAnimationFrame(tickCine);
  };
  tickCine();
  return amb;
}

/* lecteur façon bande-annonce : coupes franches, zoom lent, letterbox, grain */
function playFrames(imgs) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 432; c.className = 'play__canvas';
  playOut.appendChild(c);
  const ctx = c.getContext('2d');
  /* grain film pré-généré */
  const noise = document.createElement('canvas');
  noise.width = 256; noise.height = 256;
  const nctx = noise.getContext('2d');
  const nd = nctx.createImageData(256, 256);
  for (let i = 0; i < nd.data.length; i += 4) {
    const v = Math.random() * 255;
    nd.data[i] = nd.data[i + 1] = nd.data[i + 2] = v;
    nd.data[i + 3] = 22;
  }
  nctx.putImageData(nd, 0, 0);

  const HOLD = 2600, FADEIN = 160;
  const start = performance.now();
  const draw = (now) => {
    const t = now - start;
    const i = Math.floor(t / HOLD) % imgs.length;
    const tt = (t % HOLD) / HOLD;             /* progression dans le plan */
    /* zoom lent type Ken Burns, direction alternée */
    const zoom = i % 2 ? 1.14 - 0.09 * tt : 1.05 + 0.09 * tt;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    ctx.scale(zoom, zoom);
    ctx.drawImage(imgs[i], -c.width / 2, -c.height / 2, c.width, c.height);
    ctx.restore();
    /* coupe franche : très bref fondu depuis le noir en tête de plan */
    const ft = t % HOLD;
    if (ft < FADEIN) {
      ctx.fillStyle = `rgba(0,0,0,${1 - ft / FADEIN})`;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    /* grain film */
    ctx.drawImage(noise, Math.random() * -80, Math.random() * -80, c.width + 160, c.height + 160);
    /* vignettage */
    const vg = ctx.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.45, c.width / 2, c.height / 2, c.height * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, c.width, c.height);
    /* letterbox cinéma */
    const bar = c.height * 0.11;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, c.width, bar);
    ctx.fillRect(0, c.height - bar, c.width, bar);
    /* compteur de plan */
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '12px monospace';
    ctx.fillText(`PLAN ${i + 1}/${imgs.length}`, 14, c.height - bar - 10);
    vidRaf = requestAnimationFrame(draw);
  };
  vidRaf = requestAnimationFrame(draw);
}

/* vidéo procédurale de secours (hors-ligne) : courbes animées */
function proceduralVideo(rng) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 432; c.className = 'play__canvas';
  playOut.appendChild(c);
  const ctx = c.getContext('2d');
  const seeds = Array.from({ length: 14 }, () => ({ a: rng() * 6.28, b: rng() * 6.28, f: 0.5 + rng() * 1.5, hue: rng() }));
  const palette = ['#8b5cf6', '#22d3ee', '#e879f9'];
  const draw = (now) => {
    ctx.fillStyle = 'rgba(8,6,18,0.16)';
    ctx.fillRect(0, 0, c.width, c.height);
    const t = now * 0.001;
    seeds.forEach((s, i) => {
      ctx.strokeStyle = palette[i % 3] + 'aa';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let k = 0; k <= 60; k++) {
        const p = k / 60;
        const x = c.width * (0.1 + 0.8 * p);
        const y = c.height * (0.5 + 0.36 * Math.sin(p * 6.28 * s.f + t * s.f + s.a) * Math.cos(t * 0.7 + s.b + p * 3));
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    });
    vidRaf = requestAnimationFrame(draw);
  };
  vidRaf = requestAnimationFrame(draw);
}

/* page HTML rendue dans la modale + code source */
function showSite(html, label) {
  const frame = document.createElement('iframe');
  frame.className = 'play__frame';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.srcdoc = html;
  playOut.appendChild(frame);
  const meta = document.createElement('p');
  meta.className = 'play__meta';
  meta.textContent = label;
  playOut.appendChild(meta);
  const tog = document.createElement('button');
  tog.className = 'chip play__replay';
  tog.textContent = '</> Voir le code source';
  const codeEl = document.createElement('code');
  codeEl.className = 'play__code';
  codeEl.style.display = 'none';
  codeEl.textContent = html;
  tog.addEventListener('click', () => {
    codeEl.style.display = codeEl.style.display === 'none' ? 'block' : 'none';
  });
  playOut.appendChild(tog);
  playOut.appendChild(codeEl);
}

function sitePrompt(prompt, compact) {
  return `Génère une page web HTML5 complète et AUTONOME pour : "${prompt}". Exigences : design sombre premium (dégradés, glassmorphism), CSS compact dans <style>, textes français courts et réalistes, animations au scroll (IntersectionObserver + transitions CSS). Objet 3D : UNIQUEMENT si l'un de ces modèles correspond RÉELLEMENT au sujet, intègre <script type="module" src="https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js"></script> puis <model-viewer style="width:100%;height:320px" src="https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/NOM/glTF-Binary/NOM.glb" camera-controls auto-rotate></model-viewer> (NOM parmi : GlamVelvetSofa=canapé, SheenChair=fauteuil, ToyCar=voiture jouet, CarConcept=voiture réaliste, DamagedHelmet=casque sci-fi, Duck=canard, WaterBottle=bouteille, Lantern=lanterne, AntiqueCamera=appareil photo vintage, BoomBox=radio, ChronographWatch=montre, IridescentDishWithOlives=plat d'olives/cuisine méditerranéenne, BarramundiFish=plat de poisson, Avocado=avocat/cuisine). Si AUCUN ne correspond au sujet (ex : recettes, banque, blog) : N'INTÈGRE AUCUNE 3D — fais à la place un hero visuel en CSS pur (dégradés animés). Un canapé sur un site de recettes est une FAUTE GRAVE. Pas d'autres ressources externes. IMPÉRATIF : ${compact ? 'MAXIMUM 90 lignes, ' : 'sois compact (max 140 lignes), '}la réponse doit se terminer par </html>. Réponds UNIQUEMENT le code HTML, sans backticks.`;
}

function localGameHTML(prompt, design = {}) {
  const clean = (v, d) => (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v) ? v : d);
  const PC = clean(design.couleurJoueur, '#22d3ee');
  const EC = clean(design.couleurEnnemis, '#e879f9');
  const BGC = clean(design.couleurFond, '#06040f');
  const BLOCKY = design.style === 'blocs' || /roblox|minecraft|lego|bloc/i.test(prompt);
  const ENAME = String(design.ennemis || 'ennemis').replace(/[<>&"]/g, '').slice(0, 24);
  const title = String(design.titre || (prompt.charAt(0).toUpperCase() + prompt.slice(1))).replace(/[<>&"]/g, '').slice(0, 48);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;overflow:hidden;background:${BGC};font-family:system-ui,sans-serif;color:#fff}
  canvas{display:block;width:100vw;height:100vh}
  #ui{position:fixed;top:10px;left:12px;font-weight:700;text-shadow:0 0 8px #8b5cf6}
  #msg{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(6,4,15,.82);cursor:pointer;text-align:center}
  #msg h1{font-size:2rem;background:linear-gradient(100deg,#22d3ee,#8b5cf6,#e879f9);-webkit-background-clip:text;background-clip:text;color:transparent;margin:0 0 10px}
  #msg p{color:#9d97b8;margin:4px}
  </style></head><body>
  <canvas id="c"></canvas><div id="ui">SCORE 0 · VIES 3</div>
  <div id="msg"><h1>${title}</h1><p>Flèches / ZQSD : bouger · Souris : viser · Clic : tirer sur les ${ENAME}</p><p><b>CLIQUE POUR JOUER</b></p></div>
  <script>
  const cv=document.getElementById('c'),x=cv.getContext('2d'),ui=document.getElementById('ui'),msg=document.getElementById('msg');
  let W,H;function rs(){W=cv.width=innerWidth;H=cv.height=innerHeight}rs();addEventListener('resize',rs);
  const P={x:innerWidth/2,y:innerHeight/2,r:14,s:4.2},K={},B=[],E=[],PT=[];
  let mx=0,my=0,score=0,lives=3,run=false,spawn=0;
  addEventListener('keydown',e=>K[e.key.toLowerCase()]=1);addEventListener('keyup',e=>K[e.key.toLowerCase()]=0);
  addEventListener('mousemove',e=>{mx=e.clientX;my=e.clientY});
  addEventListener('mousedown',()=>{if(!run)return;const a=Math.atan2(my-P.y,mx-P.x);B.push({x:P.x,y:P.y,vx:Math.cos(a)*9,vy:Math.sin(a)*9})});
  msg.addEventListener('click',()=>{run=true;score=0;lives=3;E.length=0;B.length=0;P.x=W/2;P.y=H/2;msg.style.display='none'});
  function boom(x0,y0,c){for(let i=0;i<14;i++)PT.push({x:x0,y:y0,vx:(Math.random()-.5)*6,vy:(Math.random()-.5)*6,l:26,c})}
  function loop(){
    x.fillStyle='${BGC}52';x.fillRect(0,0,W,H);
    if(run){
      if(K.arrowleft||K.q)P.x-=P.s;if(K.arrowright||K.d)P.x+=P.s;
      if(K.arrowup||K.z)P.y-=P.s;if(K.arrowdown||K.s)P.y+=P.s;
      P.x=Math.max(P.r,Math.min(W-P.r,P.x));P.y=Math.max(P.r,Math.min(H-P.r,P.y));
      if(++spawn>Math.max(28,90-score))
        {spawn=0;const side=Math.random()*4|0;E.push({x:side<2?(side?W+20:-20):Math.random()*W,y:side>1?(side>2?H+20:-20):Math.random()*H,r:12+Math.random()*10})}
      E.forEach(e=>{const a=Math.atan2(P.y-e.y,P.x-e.x);e.x+=Math.cos(a)*(1.3+score/120);e.y+=Math.sin(a)*(1.3+score/120)});
      B.forEach(b=>{b.x+=b.vx;b.y+=b.vy});
      for(let i=E.length-1;i>=0;i--){const e=E[i];
        for(let j=B.length-1;j>=0;j--){const b=B[j];
          if((e.x-b.x)**2+(e.y-b.y)**2<e.r*e.r){E.splice(i,1);B.splice(j,1);score+=10;boom(e.x,e.y,'#e879f9');break}}
        if(e&&(e.x-P.x)**2+(e.y-P.y)**2<(e.r+P.r)**2){E.splice(i,1);lives--;boom(P.x,P.y,'#22d3ee');
          if(lives<=0){run=false;msg.style.display='flex';msg.querySelector('p b').textContent='GAME OVER — SCORE '+score+' · CLIQUE POUR REJOUER'}}}
      ui.textContent='SCORE '+score+' · VIES '+lives;
    }
    const BL=${BLOCKY ? 'true' : 'false'};
    function actor(cx,cy,r,col){x.fillStyle=col;
      if(BL){x.fillRect(cx-r,cy-r,r*2,r*2);x.fillStyle='#fff';x.fillRect(cx-r*.55,cy-r*.45,r*.4,r*.4);x.fillRect(cx+r*.15,cy-r*.45,r*.4,r*.4);
        x.fillStyle='#000';x.fillRect(cx-r*.45,cy-r*.35,r*.2,r*.2);x.fillRect(cx+r*.25,cy-r*.35,r*.2,r*.2)}
      else{x.beginPath();x.arc(cx,cy,r,0,7);x.fill()}}
    actor(P.x,P.y,P.r,'${PC}');
    x.strokeStyle='#8b5cf6';x.beginPath();x.moveTo(P.x,P.y);x.lineTo(P.x+(mx-P.x)*.12,P.y+(my-P.y)*.12);x.stroke();
    E.forEach(e=>actor(e.x,e.y,e.r,'${EC}'));
    x.fillStyle='#fff';B.forEach(b=>{x.beginPath();x.arc(b.x,b.y,3,0,7);x.fill()});
    for(let i=PT.length-1;i>=0;i--){const p=PT[i];p.x+=p.vx;p.y+=p.vy;p.l--;x.globalAlpha=p.l/26;x.fillStyle=p.c;x.fillRect(p.x,p.y,3,3);x.globalAlpha=1;if(p.l<=0)PT.splice(i,1)}
    requestAnimationFrame(loop);
  }loop();
  <\/script></body></html>`;
}

function localSiteHTML(prompt) {
  const title = prompt.charAt(0).toUpperCase() + prompt.slice(1);
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  body{margin:0;font-family:system-ui,sans-serif;background:#0b0818;color:#f2f0fa}
  header{padding:64px 24px;text-align:center;background:linear-gradient(120deg,#22d3ee33,#8b5cf633,#e879f933)}
  h1{font-size:2.2rem;margin:0 0 12px}p{color:#b9b3d4;max-width:560px;margin:0 auto;line-height:1.6}
  .cta{display:inline-block;margin-top:24px;padding:12px 28px;border-radius:99px;background:linear-gradient(100deg,#22d3ee,#8b5cf6,#e879f9);color:#fff;text-decoration:none;font-weight:600}
  section{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:32px 24px;max-width:860px;margin:auto}
  .card{border:1px solid #ffffff1a;border-radius:14px;padding:18px;background:#ffffff08}
  </style></head><body>
  <header><h1>${title}</h1><p>Une page générée à partir de votre prompt. Version hors-ligne — en ligne, ce HTML est écrit par un vrai LLM.</p><a class="cta" href="#">Commencer</a></header>
  <section><div class="card"><h3>Simple</h3><p>Structure claire, prête à éditer.</p></div>
  <div class="card"><h3>Rapide</h3><p>Aucune dépendance, tout est inline.</p></div>
  <div class="card"><h3>À vous</h3><p>Récupérez le code source ci-dessous.</p></div></section>
  </body></html>`;
}

let generating = false;
async function generate() {
  if (generating) return;
  const prompt = playPrompt.value.trim() || 'quelque chose de beau';
  const cfg = PLAY_CAPS[currentCap];
  const rng = seededRng(prompt + currentCap);
  const seed = Math.floor(seededRng(prompt)() * 1e6);
  generating = true;
  playGo.disabled = true;
  playGo.querySelector('span').textContent = 'Génération…';
  cleanupLiveOutputs();
  playOut.innerHTML = '';

  try {
    /* ── TEXTE / ANALYSE / CODE : vrai LLM ── */
    if (cfg.type === 'text' || cfg.type === 'code') {
      await pipeline([`Appel du modèle <b>${cfg.model}</b>`]);
      const instruction = cfg.type === 'code'
        ? `Écris uniquement du code répondant à cette demande : "${prompt}". Choisis le langage le plus adapté. Réponds SEULEMENT avec le code (commentaires brefs autorisés), sans explication autour.`
        : currentCap === 'analyse'
          ? `Tu es un analyste. En français, structure une courte analyse (max 160 mots, avec 3 points numérotés) sur : "${prompt}".`
          : `Tu es LUMEN, une IA française serviable. Réponds en français, de façon naturelle et utile (max 160 mots) à : "${prompt}".`;
      const status = document.createElement('p');
      status.className = 'play__pipe';
      status.innerHTML = '⚙ Génération…';
      playOut.appendChild(status);
      let out;
      try {
        out = await llm(instruction, 35000, status);
        status.innerHTML = `<b>✓</b> Généré par : ${lastLLMEngine}`;
      } catch (err) {
        status.innerHTML = '<b>⚠</b> Aucun moteur disponible (réseau totalement coupé) — texte de démonstration :';
        out = null;
      }
      if (cfg.type === 'code') {
        const el = document.createElement('code');
        el.className = 'play__code';
        playOut.appendChild(el);
        await typewriter(el, out ? stripFences(out) : `// ${prompt}\n// (démo locale — hors-ligne)\nexport function ${slugify(prompt).replace(/-/g, '_')}(entree) {\n  return ['analyser', 'transformer', 'valider']\n    .reduce((acc, etape) => appliquer(etape, acc), entree);\n}`, 6);
      } else {
        const el = document.createElement('p');
        el.className = 'play__text';
        playOut.appendChild(el);
        await typewriter(el, out || `« ${prompt} », donc. (Réseau indisponible ici — sur la version locale ou hébergée, cette réponse vient d'un vrai modèle ouvert.)`, 9);
      }
    }

    /* ── IMAGE : vrai FLUX ── */
    if (cfg.type === 'image') {
      await pipeline(['Traduction & enrichissement du prompt']);
      const enPrompt = await enhancePrompt(prompt);
      await pipeline([`Diffusion <b>FLUX</b> — seed ${seed}`]);
      const wait = document.createElement('p');
      wait.className = 'play__pipe';
      wait.innerHTML = '⚙ Génération de l\'image (quelques secondes)…';
      playOut.appendChild(wait);
      try {
        const img = await loadAIImage(enPrompt, seed, 768, 432, 75000);
        wait.innerHTML = '<b>✓</b> Image générée';
        aiStatusLine(true);
        img.className = 'play__canvas';
        playOut.appendChild(img);
        gsap.from(img, { opacity: 0, scale: 0.96, duration: 0.7, ease: 'power3.out' });
        const meta = document.createElement('p');
        meta.className = 'play__meta';
        meta.textContent = `FLUX (open weights) via pollinations.ai · « ${prompt} » → “${enPrompt}” · seed ${seed}`;
        playOut.appendChild(meta);
      } catch (err) {
        wait.innerHTML = '<b>⚠</b> Génération distante impossible';
        aiStatusLine(false);
        const canvas = drawArt(prompt, rng);
        playOut.appendChild(canvas);
        const meta = document.createElement('p');
        meta.className = 'play__meta';
        meta.textContent = 'Repli : art procédural local. En ligne, cette case affiche une vraie image FLUX.';
        playOut.appendChild(meta);
      }
    }

    /* ── VIDÉO : frames FLUX animées ── */
    if (cfg.type === 'steps' && currentCap === 'video') {
      await pipeline(['Analyse de la scène']);
      let cineEntry = matchLib3D(prompt);
      if (!cineEntry) cineEntry = await classifyLib3D(prompt);
      if (cineEntry) {
        const wait0 = document.createElement('p');
        wait0.className = 'play__pipe';
        wait0.innerHTML = `⚙ Construction de la map 3D + chargement de « ${cineEntry.name} »…`;
        playOut.appendChild(wait0);
        try {
          await cinematic3D(prompt, rng, cineEntry);
          wait0.innerHTML = `<b>✓</b> Plan-séquence 3D en cours — « ${cineEntry.name} » filmé en temps réel`;
          const meta = document.createElement('p');
          meta.className = 'play__meta';
          meta.textContent = `Vraie cinématique 3D rendue en direct dans votre navigateur : map générée (seed du prompt), « ${cineEntry.name} » animé, 4 plans caméra (poursuite, travelling, contre-plongée, grue) avec coupes franches. Aucune photo.`;
          playOut.appendChild(meta);
          return;
        } catch (e) {
          wait0.innerHTML = '<b>⚠</b> Scène 3D indisponible — repli storyboard';
        }
      }
      await pipeline(['Traduction & storyboard']);
      const enPrompt = await enhancePrompt(prompt, true);
      const wait = document.createElement('p');
      wait.className = 'play__pipe';
      wait.innerHTML = '⚙ Génération des images clés (0/3)…';
      playOut.appendChild(wait);
      try {
        /* même seed pour tous les plans → cohérence visuelle ; retry par plan */
        const SHOTS = ['establishing wide shot', 'medium shot', 'dramatic close-up', 'low angle action shot'];
        const imgs = [];
        for (let k = 0; k < SHOTS.length; k++) {
          wait.innerHTML = `⚙ Plan ${k + 1}/${SHOTS.length} (« ${SHOTS[k]} »)… ~15 s`;
          const shotPrompt = `${enPrompt}, ${SHOTS[k]}, consistent color grading`;
          try {
            imgs.push(await loadAIImage(shotPrompt, seed, 640, 360, 75000));
          } catch (e1) {
            try { imgs.push(await loadAIImage(shotPrompt, seed + 1, 640, 360, 75000)); }
            catch (e2) { /* plan raté, on continue */ }
          }
        }
        if (imgs.length < 1) throw new Error('aucun plan généré');
        wait.innerHTML = `<b>✓</b> ${imgs.length}/${SHOTS.length} plans générés (même seed → même univers visuel)`;
        aiStatusLine(true);
        playFrames(imgs);
        const meta = document.createElement('p');
        meta.className = 'play__meta';
        meta.textContent = `Storyboard animé : ${imgs.length} vraies images FLUX · « ${prompt} » → “${enPrompt}” — la version complète interpole en vraie vidéo 24 i/s (Wan/LTX).`;
        playOut.appendChild(meta);
      } catch (err) {
        wait.innerHTML = '<b>⚠</b> Génération distante impossible';
        aiStatusLine(false);
        proceduralVideo(rng);
        const meta = document.createElement('p');
        meta.className = 'play__meta';
        meta.textContent = 'Repli : animation procédurale locale. En ligne, la séquence est faite de vraies images FLUX.';
        playOut.appendChild(meta);
      }
    }

    /* ── SITE : HTML écrit par le LLM, rendu ici ── */
    if (cfg.type === 'steps' && currentCap === 'site') {
      const GAMEY = /\bjeu\b|game|fortnite|jouable|shooter|arcade|plateforme|fps|battle/i;
      if (GAMEY.test(prompt)) {
        await pipeline(['Game design → boucle de jeu']);
        const gameStatus = document.createElement('p');
        gameStatus.className = 'play__pipe';
        gameStatus.innerHTML = '⚙ Direction artistique…';
        playOut.appendChild(gameStatus);
        /* le LLM écrit d'abord une fiche de design pour thématiser le jeu */
        let design = null;
        try {
          const dj = await llm(`Fiche de design JSON pour un mini-jeu 2D sur le thème "${prompt}". Réponds UNIQUEMENT un JSON valide : {"titre":"…","couleurJoueur":"#hex","couleurEnnemis":"#hex","couleurFond":"#hex sombre","ennemis":"nom court des ennemis","style":"blocs" ou "rond"} — "blocs" si le thème évoque roblox/minecraft/lego, sinon au choix.`, 18000, null, false);
          design = JSON.parse(dj.slice(dj.indexOf('{'), dj.lastIndexOf('}') + 1));
          gameStatus.innerHTML = `<b>✓</b> DA : « ${design.titre || prompt} », ennemis « ${design.ennemis || '?'} », style ${design.style || 'rond'}`;
        } catch (e) { /* défauts seedés */ }
        let ghtml = null;
        try {
          ghtml = stripFences(await llm(`Crée un MINI-JEU HTML5 JOUABLE sur le thème "${prompt}" : une page HTML complète avec <canvas> plein écran, un joueur déplaçable (flèches/ZQSD), tir vers la souris au clic, ennemis qui apparaissent et poursuivent, score et vies affichés, écran "clique pour jouer", game over avec rejouer. Style néon sombre. Tout le JS inline, AUCUNE ressource externe. IMPÉRATIF : max 130 lignes et termine par </html>. Réponds UNIQUEMENT le HTML.`, 60000, gameStatus, false));
          if (!/<canvas/i.test(ghtml) || !/<\/html>\s*$/i.test(ghtml)) throw new Error('jeu invalide');
          gameStatus.innerHTML = `<b>✓</b> Jeu écrit par : ${lastLLMEngine}`;
        } catch (e) {
          ghtml = null;
          gameStatus.innerHTML = '<b>✓</b> Jeu généré par le moteur local LUMEN';
        }
        showSite(ghtml || localGameHTML(prompt, design || {}),
          'Mini-jeu JOUABLE rendu ci-dessus — clique dedans puis flèches/ZQSD pour bouger, souris pour tirer.');
        return;
      }
      await pipeline(['Brief → structure → style']);
      const siteStatus = document.createElement('p');
      siteStatus.className = 'play__pipe';
      siteStatus.innerHTML = '⚙ Écriture du HTML…';
      playOut.appendChild(siteStatus);
      let html = null;
      try {
        html = stripFences(await llm(
          sitePrompt(prompt, false), 60000, siteStatus, false));
        if (!/</.test(html || '')) throw new Error('sortie invalide');
        if (!/<\/html>\s*$/i.test(html)) {
          /* sortie tronquée par la limite du modèle : seconde passe plus courte */
          siteStatus.innerHTML = '⚙ Sortie tronquée — régénération en version compacte…';
          try {
            const html2 = stripFences(await llm(sitePrompt(prompt, true), 60000, siteStatus, false));
            if (/<\/html>\s*$/i.test(html2)) html = html2;
          } catch (e) { /* on garde la première */ }
        }
        if (!/<\/html>\s*$/i.test(html)) html += '\n</body></html>';
        siteStatus.innerHTML = `<b>✓</b> HTML écrit par : ${lastLLMEngine}`;
      } catch (err) {
        siteStatus.innerHTML = '<b>⚠</b> Aucun moteur texte disponible — gabarit local rendu ci-dessous :';
      }
      showSite(html || localSiteHTML(prompt),
        html ? `Page écrite par un LLM ouvert et rendue ci-dessus · « ${prompt} »` : `Page construite localement · « ${prompt} »`);
    }

    /* ── 3D : objet réel manipulable ── */
    if (cfg.type === 'steps' && currentCap === 'jeu') {
      await pipeline(['Analyse du prompt']);
      let info, label;
      /* 1. correspondance directe par mots-clés (déterministe et sûre) */
      const kwEntry = matchLib3D(prompt);
      const catStatus = document.createElement('p');
      catStatus.className = 'play__pipe';
      catStatus.innerHTML = kwEntry
        ? `<b>✓</b> Correspondance directe : « ${kwEntry.name} »`
        : '⚙ Recherche dans le catalogue open source (≈60 modèles)…';
      playOut.appendChild(catStatus);
      if (kwEntry) {
        try {
          const g = await loadGLB(kwEntry.file, 45000);
          const rm = [];
          g.scene.traverse((o) => { if (/cloth|backdrop/i.test(o.name) || (/ToyCar/.test(kwEntry.file) && /^(fabric|glass)$/i.test(o.name))) rm.push(o); });
          rm.forEach((o) => o.parent && o.parent.remove(o));
          if (kwEntry.tint) g.scene.traverse((o) => {
            if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.color.set(kwEntry.tint); }
          });
          info = spawnMini3d(rng, g.scene, kwEntry.size || 1.8, g.animations);
          label = `Vrai modèle 3D « ${kwEntry.name} » (${info.triangles.toLocaleString('fr-FR')} triangles) — cliquer-glisser pour le faire tourner.`;
        } catch (e) { catStatus.innerHTML = `<b>⚠</b> « ${kwEntry.name} » inaccessible — recherche IA`; }
      }
      /* 2. sinon l'IA fouille le catalogue complet, en évitant le déjà-vu */
      let picked = null;
      if (!info) { try { picked = await pickFromCatalog(prompt); } catch (e) { /* hors-ligne */ } }
      if (picked && !info) {
        catStatus.innerHTML = `<b>✓</b> Choix de l'IA : « ${picked.id} »${picked.label ? ' — ' + picked.label : ''}`;
        try {
          const g = await loadGLB(picked.file, 45000);
          const rm = [];
          g.scene.traverse((o) => { if (/cloth|backdrop/i.test(o.name)) rm.push(o); });
          rm.forEach((o) => o.parent && o.parent.remove(o));
          info = spawnMini3d(rng, g.scene, 1.8, g.animations);
          markUsed3D(picked.id);
          label = `Vrai modèle GLB « ${picked.id} » choisi par l'IA dans le catalogue Khronos (${info.triangles.toLocaleString('fr-FR')} triangles) — cliquer-glisser pour le faire tourner. Historique anti-répétition actif.`;
        } catch (e) {
          catStatus.innerHTML = `<b>⚠</b> « ${picked.id} » inaccessible — recherche locale`;
        }
      } else {
        catStatus.innerHTML = '<b>⚠</b> Catalogue distant indisponible — correspondance locale';
      }
      let entry = info ? null : matchLib3D(prompt);
      if (!info && !entry) entry = await classifyLib3D(prompt);
      if (entry) {
        const wait = document.createElement('p');
        wait.className = 'play__pipe';
        wait.innerHTML = `⚙ Chargement du modèle « ${entry.name} »…`;
        playOut.appendChild(wait);
        try {
          const g = await loadGLB(entry.file);
          /* le dragon embarque un fond de tissu */
          const rm = [];
          g.scene.traverse((o) => { if (/cloth|backdrop/i.test(o.name)) rm.push(o); });
          rm.forEach((o) => o.parent && o.parent.remove(o));
          wait.innerHTML = `<b>✓</b> Modèle « ${entry.name} » chargé`;
          info = spawnMini3d(rng, g.scene, entry.size, g.animations);
          label = `Vrai modèle 3D open source « ${entry.name} » (bibliothèque Khronos glTF), ${info.triangles.toLocaleString('fr-FR')} triangles, sélectionné par l'IA d'après votre prompt — cliquer-glisser pour le faire tourner.`;
        } catch (e) {
          wait.innerHTML = '<b>⚠</b> Modèle inaccessible ici — forme générative à la place';
        }
      }
      if (!info) {
        await pipeline(['Maillage sculpté par le prompt']);
        info = spawnMini3d(rng);
        label = `Aucun modèle de la bibliothèque ne correspond : forme générative (${info.triangles.toLocaleString('fr-FR')} triangles), manipulable à la souris. La version complète fait du vrai text-to-3D (TripoSR).`;
      }
      const meta = document.createElement('p');
      meta.className = 'play__meta';
      meta.textContent = label;
      playOut.appendChild(meta);
    }

    /* ── AUDIO : voix du texte demandé / bruitage synthétisé / musique ── */
    if (cfg.type === 'audio') {
      const MUSICY = /musique|music|\brap\b|chanson|\bbeat\b|instru|\bson de rap|hip.?hop|m[ée]lodie/i;
      const SFXY = /bruit|\bson\b|sound|effet sonore/i;
      let sfxKind = matchSFX(prompt);

      if (!sfxKind && SFXY.test(prompt) && !MUSICY.test(prompt)) {
        /* l'IA mappe la demande vers le bruitage le plus proche */
        await pipeline(['Analyse de la demande sonore']);
        try {
          const k = (await llm(`Quel effet sonore correspond le mieux à "${prompt}" ? Choisis UN mot parmi : ${Object.keys(SFX_DEFS).join(', ')}, ou NONE. Réponds seulement le mot.`, 12000)).toLowerCase().trim();
          if (SFX_DEFS[k]) sfxKind = k;
        } catch (e) { /* on passera en voix */ }
      }

      if (sfxKind) {
        /* ─ bruitage réellement synthétisé, téléchargeable ─ */
        await pipeline([`Synthèse du bruitage « <b>${sfxKind}</b> » (WebAudio, hors-ligne)`]);
        const buf = await renderSFX(sfxKind);
        audioResult(buf, `lumen-${sfxKind}.wav`,
          `Bruitage « ${sfxKind} » généré par synthèse (oscillateurs + bruit filtré), pour « ${prompt} ». Fichier .wav téléchargeable. La version complète utilise AudioGen pour des sons photoréalistes.`);
      } else if (MUSICY.test(prompt)) {
        /* ─ musique : paroles LLM + instru générée + voix ─ */
        await pipeline(['Écriture des paroles']);
        let lyrics = null;
        try { lyrics = await llm(`Écris 8 lignes de ${/rap/i.test(prompt) ? 'rap' : 'chanson'} en français, percutantes et qui riment, sur : "${prompt}". Réponds UNIQUEMENT les 8 lignes.`, 25000); }
        catch (e) { lyrics = null; }
        await pipeline(['Composition de l\'instru (88 BPM, batterie + basse)']);
        const buf = await renderBeat(rng);
        const player = audioResult(buf, 'lumen-instru.wav',
          `Instru générée note par note (kick/snare/hats/basse seedés par votre prompt) — .wav téléchargeable.` + (lyrics ? ' La voix lit les paroles par-dessus.' : ''));
        if (lyrics) {
          const txt = document.createElement('p');
          txt.className = 'play__text';
          txt.textContent = lyrics;
          playOut.appendChild(txt);
          setTimeout(() => speak(lyrics), 600);
          player.addEventListener('play', () => speak(lyrics));
        }
      } else {
        /* ─ voix : dire EXACTEMENT ce qui est demandé ─ */
        const isInstruction = /^(dis|d[ée]clame|lis|r[ée]cite|annonce|raconte|fais dire)\b/i.test(prompt);
        let toSay = prompt;
        if (isInstruction) {
          await pipeline(['Rédaction du texte à prononcer']);
          try { toSay = await llm(`Donne UNIQUEMENT le texte exact à prononcer pour cette demande (sans guillemets ni commentaire) : "${prompt}"`, 15000); } catch (e) { toSay = prompt.replace(/^(dis|d[ée]clame|lis|r[ée]cite|annonce|raconte|fais dire)\s*/i, ''); }
        }
        await pipeline(['Synthèse vocale du texte demandé']);
        const txt = document.createElement('p');
        txt.className = 'play__text';
        txt.textContent = '« ' + toSay + ' »';
        playOut.appendChild(txt);
        let gotFile = false;
        try {
          const blob = await ttsDownloadable(toSay);
          const url = URL.createObjectURL(blob);
          const player = document.createElement('audio');
          player.controls = true; player.src = url; player.style.cssText = 'width:100%;margin-top:0.8rem;';
          playOut.appendChild(player);
          const dl = document.createElement('a');
          dl.className = 'chip play__replay';
          dl.textContent = '⬇ Télécharger (.mp3)';
          dl.href = url; dl.download = 'lumen-voix.mp3';
          playOut.appendChild(dl);
          player.play().catch(() => {});
          gotFile = true;
          const m = document.createElement('p'); m.className = 'play__meta';
          m.textContent = 'Voix IA générée (openai-audio via pollinations.ai) — fichier téléchargeable.';
          playOut.appendChild(m);
        } catch (e) { /* repli voix navigateur */ }
        if (!gotFile) {
          speak(toSay);
          const b = document.createElement('button');
          b.className = 'chip play__replay';
          b.textContent = '🔊 Réécouter';
          b.addEventListener('click', () => speak(toSay));
          playOut.appendChild(b);
          const m = document.createElement('p'); m.className = 'play__meta';
          m.textContent = 'Voix du navigateur (l\'API distante de TTS téléchargeable n\'a pas répondu ici).';
          playOut.appendChild(m);
        }
      }
    }
  } finally {
    playGo.disabled = false;
    playGo.querySelector('span').textContent = 'Générer';
    generating = false;
    playEmote('agree', true);
  }
}
playGo.addEventListener('click', generate);
playPrompt.addEventListener('keydown', (e) => { if (e.key === 'Enter') generate(); });
