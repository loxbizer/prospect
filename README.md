# ÉLOGE — Maison de mobilier d'exception

Site vitrine premium (démo) pour une maison française de mobilier haut de gamme :
le cas type de l'entreprise qui a les moyens et les produits, mais un site indigne d'elle.

## Ce qu'il y a dedans

- **Vraie 3D temps réel** — trois vrais modèles GLB (pas du 2.5D généré) issus de la
  bibliothèque libre [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) :
  - `GlamVelvetSofa` (CC-BY 4.0 — Eric Chadwick / Wayfair)
  - `SheenChair` (CC0 — Eric Chadwick / Wayfair)
  - `ChairDamaskPurplegold` (CC-BY 4.0 — Eric Chadwick / Wayfair)
- **Hero 3D** : canapé en velours éclairé en PBR, rotation liée au scroll, parallaxe souris,
  impulsion au clic sur la pièce.
- **Atelier 3D interactif** : changement de pièce au clic, rotation au cliquer-glisser avec
  inertie, animation au clic sur l'objet, et **changement de matière réel** via l'extension
  glTF `KHR_materials_variants` (velours mangue / paon / safran…).
- **Motion design** : GSAP + ScrollTrigger — préloader, textes masqués mot à mot, compteurs,
  parallaxe d'images, marquee infini, curseur personnalisé, boutons magnétiques,
  slider de témoignages.
- **Vraies photographies** (Unsplash, chargées côté navigateur).
- Zéro build, zéro dépendance à installer : tout est vendoré dans `js/vendor/`.

## Lancer

N'importe quel serveur statique (les modules ES exigent `http://`, pas `file://`) :

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

## Structure

```
index.html          — la page
css/style.css       — thème sombre « maison de luxe »
js/main.js          — scènes Three.js + animations GSAP
js/vendor/          — three.module.js, GLTFLoader, RoomEnvironment, gsap, ScrollTrigger
assets/models/      — les 3 fichiers .glb
```

## Crédits

Modèles 3D : Eric Chadwick / Wayfair, bibliothèque Khronos glTF Sample Assets (CC0 & CC-BY 4.0).
Photographies : Unsplash. Entreprise et témoignages fictifs — site de démonstration.
