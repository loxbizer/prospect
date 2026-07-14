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
    /* teintes froides qui dérivent lentement, respiration rouge au sol */
    spotA.color.setHSL(0.68 + Math.sin(t * 0.06) * 0.06, 0.7, 0.58);
    spotB.color.setHSL(0.54 + Math.sin(t * 0.09 + 2) * 0.05, 0.8, 0.6);
    rimLight.intensity = 36 + Math.sin(t * 1.4) * 12;
    underGlow.intensity = 5 + Math.sin(t * 2.1) * 2.5;
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

async function llmOnce(prompt, timeout) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt), { signal: ctrl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const text = (await r.text()).trim();
    if (!text) throw new Error('réponse vide');
    return text;
  } finally { clearTimeout(timer); }
}
let lastLLMEngine = '';
async function llm(prompt, timeout = 35000, statusEl = null) {
  try { const r = await llmOnce(prompt, timeout); lastLLMEngine = 'API pollinations.ai'; return r; }
  catch (e1) {
    try { const r = await llmOnce(prompt, timeout); lastLLMEngine = 'API pollinations.ai'; return r; }
    catch (e2) {
      /* l'API distante ne répond pas : vrai modèle local dans le navigateur */
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
  if (mini3d) { cancelAnimationFrame(mini3d.raf); mini3d.renderer.dispose(); mini3d = null; }
  if (vidRaf) { cancelAnimationFrame(vidRaf); vidRaf = 0; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
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
  { keys: ['canap', 'sofa', 'divan', 'banquette'], file: '../assets/models/GlamVelvetSofa.glb', name: 'Canapé en velours', size: 1.9 },
  { keys: ['chaise', 'fauteuil', 'chair', 'siège', 'siege', 'assise'], file: '../assets/models/SheenChair.glb', name: 'Fauteuil bouclé', size: 1.8 },
  { keys: ['voiture', 'auto', 'car', 'bagnole', 'vehicule', 'véhicule'], file: 'assets/models/lib/ToyCar.glb', name: 'Voiture', size: 1.9 },
  { keys: ['canard', 'duck', 'oiseau', 'poule'], file: 'assets/models/lib/Duck.glb', name: 'Canard', size: 1.7 },
  { keys: ['casque', 'helmet', 'armure', 'soldat', 'guerrier', 'cyber'], file: 'assets/models/lib/DamagedHelmet.glb', name: 'Casque sci-fi', size: 1.8 },
  { keys: ['bouteille', 'bottle', 'gourde', 'eau', 'boisson'], file: 'assets/models/lib/WaterBottle.glb', name: 'Bouteille', size: 1.7 },
  { keys: ['dragon', 'creature', 'créature', 'monstre'], file: 'assets/models/DragonAttenuation.glb', name: 'Dragon de verre', size: 1.9 },
];
const LIB3D_WORDS = { sofa: 0, chair: 1, car: 2, duck: 3, helmet: 4, bottle: 5, dragon: 6 };

function matchLib3D(prompt) {
  const p = prompt.toLowerCase();
  return LIB3D.find((e) => e.keys.some((k) => p.includes(k))) || null;
}

async function classifyLib3D(prompt) {
  try {
    const out = (await llm(`Classify "${prompt}" into exactly one word among: sofa, chair, car, duck, helmet, bottle, dragon, abstract. Answer only the word.`, 12000)).toLowerCase();
    for (const w in LIB3D_WORDS) if (out.includes(w)) return LIB3D[LIB3D_WORDS[w]];
  } catch (e) { /* pas grave */ }
  return null;
}

function loadGLB(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), timeout);
    loader.load(url, (g) => { clearTimeout(t); resolve(g); }, undefined, (e) => { clearTimeout(t); reject(e); });
  });
}

/* objet 3D réel, manipulable — modèle GLB fourni, sinon forme sculptée */
function spawnMini3d(rng, model3d = null, modelSize = 1.8) {
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

  mini3d = { renderer, raf: 0 };
  const tick3d = () => {
    if (!mini3d) return;
    if (!dragging) { vx *= 0.95; mesh.rotation.y += 0.006 + vx; }
    mesh.rotation.x = Math.sin(performance.now() * 0.0004) * (model3d ? 0.08 : 0.22);
    if (wire) wire.rotation.copy(mesh.rotation);
    renderer.render(scene, cam);
    mini3d.raf = requestAnimationFrame(tick3d);
  };
  tick3d();
  return { triangles: Math.round(tris) };
}

/* lecteur de frames IA : fondu enchaîné + léger zoom (Ken Burns) */
function playFrames(imgs) {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 432; c.className = 'play__canvas';
  playOut.appendChild(c);
  const ctx = c.getContext('2d');
  const per = 1500, fade = 550;
  const start = performance.now();
  const drawImg = (img, tt, alpha) => {
    ctx.globalAlpha = alpha;
    const zoom = 1.03 + 0.07 * tt;
    ctx.save();
    ctx.translate(c.width / 2, c.height / 2);
    ctx.scale(zoom, zoom);
    ctx.drawImage(img, -c.width / 2, -c.height / 2, c.width, c.height);
    ctx.restore();
    ctx.globalAlpha = 1;
  };
  const draw = (now) => {
    const t = now - start;
    const i = Math.floor(t / per) % imgs.length;
    const tt = (t % per) / per;
    drawImg(imgs[i], tt, 1);
    const ft = (t % per) - (per - fade);
    if (ft > 0) drawImg(imgs[(i + 1) % imgs.length], 0, ft / fade);
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
      await pipeline(['Traduction & storyboard']);
      const enPrompt = await enhancePrompt(prompt, true);
      const wait = document.createElement('p');
      wait.className = 'play__pipe';
      wait.innerHTML = '⚙ Génération des images clés (0/3)…';
      playOut.appendChild(wait);
      try {
        /* séquentiel : l'API gratuite limite les requêtes parallèles */
        const imgs = [];
        for (let k = 0; k < 5; k++) {
          wait.innerHTML = `⚙ Génération des images clés (${k}/5)… ~15 s chacune`;
          try {
            imgs.push(await loadAIImage(`${enPrompt}, shot ${k + 1} of 5`, seed + k, 512, 288, 90000));
          } catch (e) { /* on tolère une frame manquée */ }
        }
        if (imgs.length < 2) throw new Error('trop de frames manquées');
        wait.innerHTML = `<b>✓</b> ${imgs.length} images clés générées`;
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
      await pipeline(['Brief → structure → style']);
      const siteStatus = document.createElement('p');
      siteStatus.className = 'play__pipe';
      siteStatus.innerHTML = '⚙ Écriture du HTML…';
      playOut.appendChild(siteStatus);
      let html = null;
      try {
        html = stripFences(await llm(
          `Génère une page web HTML5 complète et AUTONOME pour : "${prompt}". Exigences : design sombre premium (dégradés, glassmorphism), CSS dans <style>, textes français réalistes, animations au scroll (IntersectionObserver + transitions). Si le sujet s'y prête, intègre un objet 3D réel avec <script type="module" src="https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js"></script> et <model-viewer style="width:100%;height:340px" src="https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb" camera-controls auto-rotate shadow-intensity="1"></model-viewer> (autres GLB dispo en remplaçant DamagedHelmet par Duck, ToyCar ou WaterBottle). Pas d'images externes autres que le GLB. Réponds UNIQUEMENT le code HTML, sans backticks.`, 60000, siteStatus));
        if (!/</.test(html || '')) throw new Error('sortie invalide');
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
      let entry = matchLib3D(prompt);
      if (!entry) entry = await classifyLib3D(prompt);
      let info, label;
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
          info = spawnMini3d(rng, g.scene, entry.size);
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

    /* ── AUDIO : vraie voix + mélodie ── */
    if (cfg.type === 'audio') {
      await pipeline(['Synthèse de la mélodie', 'Préparation de la voix']);
      const eq = document.createElement('div');
      eq.className = 'play__eq';
      for (let i = 0; i < 28; i++) eq.appendChild(document.createElement('span'));
      playOut.appendChild(eq);
      const bars = [...eq.children];
      playMelody(rng, bars);
      let phrase = `${prompt}. Voilà ce que je peux chanter pour toi, humain.`;
      try {
        phrase = await llm(`En une ou deux phrases courtes en français, réponds avec personnalité (tu es LUMEN, une IA androïde calme) à : "${prompt}".`, 20000);
        aiStatusLine(true);
      } catch (err) { /* la voix locale marche quand même */ }
      const meta = document.createElement('p');
      meta.className = 'play__meta';
      meta.textContent = 'Mélodie synthétisée en Web Audio + voix française de votre navigateur (Web Speech).';
      playOut.appendChild(meta);
      const row = document.createElement('div');
      const voiceBtn = document.createElement('button');
      voiceBtn.className = 'chip play__replay';
      voiceBtn.textContent = '🔊 Écouter la voix';
      voiceBtn.addEventListener('click', () => {
        if (!speak(phrase)) showToast('Synthèse vocale non disponible dans ce navigateur');
      });
      const replay = document.createElement('button');
      replay.className = 'chip play__replay';
      replay.style.marginLeft = '0.5rem';
      replay.textContent = '↻ Rejouer la mélodie';
      replay.addEventListener('click', () => playMelody(seededRng(prompt + currentCap), bars));
      row.appendChild(voiceBtn); row.appendChild(replay);
      playOut.appendChild(row);
      speak(phrase);
      const txt = document.createElement('p');
      txt.className = 'play__text';
      txt.textContent = '« ' + phrase + ' »';
      playOut.appendChild(txt);
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
