/**
 * Taye Bhaskar — Realistic 3D Athletic Stadium Track & Bicycle Portfolio
 * - Complete 6-Lane Athletic Tartan Track with official lane lines, start marks & painted numbers
 * - Full Sports Pitch (manicured lawn stripes, regulation pitch markings, 3D soccer goals)
 * - Perfectly aligned 3D Bicycle & Animated Cyclist (straight in Lane 3, realistic spoked wheels, helmet & green backpack)
 * - Highly responsive scroll physics: 2 scrolls smoothly propels cycle forward
 * - Seamless camera chase initialized directly behind rider (zero jerk/misalignment)
 * - 3D Gates ("Work", "Resume", "Contact"), Stadium Floodlights, Perimeter Railings & Web Audio Bell
 */

// Global State
const state = {
  // Movement & Physics
  trackDistance: 0.12, // Starting position at the Start Line of the straightaway
  velocity: 0,
  targetVelocity: 0,
  maxSpeed: 0.012, // Responsive top cruising speed
  friction: 0.935, // Natural bicycle coasting friction
  acceleration: 0.0018,
  scrollSensitivity: 0.014, // 2 scrolls smoothly cruises bike forward!
  scrollDirectionInverted: false, // false: Scroll Up = Forward, Scroll Down = Back

  // Audio
  audioEnabled: false,
  audioContext: null,
  tireGain: null,
  tireFilter: null,

  // Gates & Milestones along the 400m track
  gates: [
    { id: 'work', t: 0.23, label: 'Work', color: 0xffa000, secondaryColor: 0xffb74d },
    { id: 'resume', t: 0.58, label: 'Resume', color: 0x0288d1, secondaryColor: 0x4fc3f7 },
    { id: 'contact', t: 0.88, label: 'Contact', color: 0x1976d2, secondaryColor: 0x64b5f6 }
  ],
  activeModalSection: null,
  lastVisitedGate: null,

  // Atmosphere Themes
  themeIndex: 0, // 0: Day, 1: Sunset, 2: Night
  themes: [
    { name: 'day', sky: 0xd6eeff, ground: 0x82c878, fog: 0xd6eeff, light: 0xfffaea, intensity: 1.25 },
    { name: 'sunset', sky: 0xffb074, ground: 0x76a868, fog: 0xffb074, light: 0xff7b25, intensity: 1.4 },
    { name: 'night', sky: 0x0d1520, ground: 0x1a3320, fog: 0x0d1520, light: 0x24334a, intensity: 0.45 }
  ]
};

// Scene Essentials
let scene, camera, renderer;
let trackCurve, trackLength;
const numLanes = 6;
const trackWidth = 8.6; // 6 lanes ~1.43m each
const laneWidth = trackWidth / numLanes;
const bikeLaneIndex = 2; // Lane 3 (0-indexed: lane 2)
const bikeLaneOffset = -trackWidth / 2 + (bikeLaneIndex + 0.5) * laneWidth; // centered in Lane 3

let bikeGroup, frontWheelGroup, rearWheelGroup, crankGroup, leftPedal, rightPedal;
let riderLeftLeg, riderRightLeg;
let floodlights = [];
let particlesSystem;

// DOM Elements
const webglContainer = document.getElementById('webgl-container');
const speedValueEl = document.getElementById('speedValue');
const trackIndicatorEl = document.getElementById('trackIndicator');
const soundTooltip = document.getElementById('soundTooltip');
const soundBtn = document.getElementById('dockSoundBtn');
const soundIconOn = document.getElementById('soundIconOn');
const soundIconOff = document.getElementById('soundIconOff');
const themeBtn = document.getElementById('dockThemeBtn');
const sectionModal = document.getElementById('sectionModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const toggleScrollBtn = document.getElementById('toggleScrollDirectionBtn');
const scrollModeLabel = document.getElementById('scrollModeLabel');

// Keyboard state
const keysDown = {
  w: false,
  s: false,
  shift: false,
  arrowup: false,
  arrowdown: false
};

/* =========================================================
   1. Initialize Three.js Scene
   ========================================================= */
function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(state.themes[0].sky);
  scene.fog = new THREE.FogExp2(state.themes[0].fog, 0.0055);

  camera = new THREE.PerspectiveCamera(
    46,
    window.innerWidth / window.innerHeight,
    0.1,
    700
  );

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  webglContainer.appendChild(renderer.domElement);

  // Lighting
  setupLighting();

  // Track Curve
  createTrackCurve();

  // Build Environment, Full Track & Infield Pitch
  buildEnvironment();
  buildRealisticTrack();
  buildSoccerField();
  buildPerimeterRailings();
  build3DGates();
  buildStadiumTowers();
  buildFloatingParticles();

  // Build Perfectly Aligned 3D Bicycle & Rider
  buildCyclist();

  // Initialize Camera Directly Behind Rider (No Initial Lag/Jump!)
  alignCameraInitial();

  // Event Listeners
  setupEventListeners();

  // Animation Loop
  requestAnimationFrame(animate);
}

/* =========================================================
   2. Lighting Setup
   ========================================================= */
let hemiLight, sunLight;
function setupLighting() {
  hemiLight = new THREE.HemisphereLight(0xf0f8ff, 0x5a8848, 0.8);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xfffaec, 1.35);
  sunLight.position.set(55, 95, 45);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 300;

  const d = 90;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0003;

  scene.add(sunLight);
}

/* =========================================================
   3. Stadium Track Mathematical Spline
   ========================================================= */
function createTrackCurve() {
  // Olympic stadium oval: Two straightaways connected by semicircular bends
  const straightLength = 52;
  const turnRadius = 28;
  const numSamples = 80;
  const points = [];

  for (let i = 0; i < numSamples; i++) {
    const frac = i / numSamples;
    let x = 0, z = 0;

    if (frac < 0.25) {
      // Straightaway 1 (top, moving from right +X to left -X)
      const tSeg = frac / 0.25;
      x = straightLength / 2 - tSeg * straightLength;
      z = turnRadius;
    } else if (frac < 0.50) {
      // Left Turn (semicircle)
      const tSeg = (frac - 0.25) / 0.25;
      const angle = Math.PI / 2 + tSeg * Math.PI;
      x = -straightLength / 2 + Math.cos(angle) * turnRadius;
      z = Math.sin(angle) * turnRadius;
    } else if (frac < 0.75) {
      // Straightaway 2 (bottom, moving from left -X to right +X)
      const tSeg = (frac - 0.50) / 0.25;
      x = -straightLength / 2 + tSeg * straightLength;
      z = -turnRadius;
    } else {
      // Right Turn (semicircle)
      const tSeg = (frac - 0.75) / 0.25;
      const angle = -Math.PI / 2 + tSeg * Math.PI;
      x = straightLength / 2 + Math.cos(angle) * turnRadius;
      z = Math.sin(angle) * turnRadius;
    }

    points.push(new THREE.Vector3(x, 0.22, z));
  }

  trackCurve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
  trackLength = trackCurve.getLength();
}

/* =========================================================
   4. Outer Environment & Rolling Hills
   ========================================================= */
function buildEnvironment() {
  // Rolling terrain around the stadium
  const groundGeo = new THREE.PlaneGeometry(420, 420, 64, 64);
  groundGeo.rotateX(-Math.PI / 2);

  const pos = groundGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const dist = Math.sqrt(x * x + z * z);

    // Keep the stadium flat in the middle, elevate rolling hills beyond r=48m
    if (dist > 46) {
      const hillHeight = Math.sin(x * 0.035) * Math.cos(z * 0.035) * 6 +
                         Math.sin(x * 0.018 + z * 0.025) * 8;
      const blend = Math.min(1, (dist - 46) / 35);
      pos.setY(i, Math.max(0, hillHeight * blend));
    } else {
      pos.setY(i, 0);
    }
  }
  groundGeo.computeVertexNormals();

  const groundMat = new THREE.MeshLambertMaterial({
    color: 0x82c878,
    roughness: 0.85
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  // Stylized Low-Poly Pine Trees on the hills
  buildPineTrees();
}

function buildPineTrees() {
  const treesGroup = new THREE.Group();
  const treeCount = 110;
  const treeColors = [0x2e7d32, 0x388e3c, 0x43a047, 0x2e6b36];

  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 2.2, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x795548 });

  for (let i = 0; i < treeCount; i++) {
    const angle = (i / treeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
    const dist = 52 + Math.random() * 95;
    const x = Math.cos(angle) * (dist * 1.25);
    const z = Math.sin(angle) * (dist * 0.95);

    const tree = new THREE.Group();

    // Trunk
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.1;
    trunk.castShadow = true;
    tree.add(trunk);

    // 2 Foliage Cones
    const folColor = treeColors[Math.floor(Math.random() * treeColors.length)];
    const folMat = new THREE.MeshLambertMaterial({ color: folColor, flatShading: true });

    const cone1 = new THREE.Mesh(new THREE.ConeGeometry(2.1, 3.2, 6), folMat);
    cone1.position.y = 2.9;
    cone1.castShadow = true;
    tree.add(cone1);

    const cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.6, 6), folMat);
    cone2.position.y = 4.6;
    cone2.castShadow = true;
    tree.add(cone2);

    const scale = 0.8 + Math.random() * 0.6;
    tree.scale.set(scale, scale, scale);

    // Sample terrain elevation
    const hillHeight = Math.sin(x * 0.035) * Math.cos(z * 0.035) * 6;
    tree.position.set(x, Math.max(0, hillHeight * 0.65), z);

    treesGroup.add(tree);
  }

  scene.add(treesGroup);
}

/* =========================================================
   5. Build Complete 6-Lane Athletic Running Track
   ========================================================= */
function buildRealisticTrack() {
  const trackGroup = new THREE.Group();
  const samples = 260;

  // Track Ribbon Mesh
  const trackGeo = new THREE.BufferGeometry();
  const vertices = [];
  const uvs = [];
  const indices = [];

  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const pt = trackCurve.getPointAt(t);
    const tangent = trackCurve.getTangentAt(t).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

    // Outer & Inner track edges
    const pInner = pt.clone().addScaledVector(normal, -trackWidth / 2);
    const pOuter = pt.clone().addScaledVector(normal, trackWidth / 2);

    pInner.y = 0.14;
    pOuter.y = 0.14;

    vertices.push(pInner.x, pInner.y, pInner.z);
    vertices.push(pOuter.x, pOuter.y, pOuter.z);

    uvs.push(0, t * 16);
    uvs.push(1, t * 16);

    if (i < samples) {
      const idx = i * 2;
      indices.push(idx, idx + 1, idx + 2);
      indices.push(idx + 1, idx + 3, idx + 2);
    }
  }

  trackGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  trackGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  trackGeo.setIndex(indices);
  trackGeo.computeVertexNormals();

  // Tartan Synthetic Track Texture with rubber texture
  const trackMat = new THREE.MeshLambertMaterial({
    color: 0xee6a4b, // Warm vibrant terracotta red
    roughness: 0.82
  });

  const trackMesh = new THREE.Mesh(trackGeo, trackMat);
  trackMesh.receiveShadow = true;
  trackGroup.add(trackMesh);

  // 7 Crisp White Lane Lines (defining the 6 lanes)
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  for (let l = 0; l <= numLanes; l++) {
    const offset = -trackWidth / 2 + l * laneWidth;
    const linePoints = [];

    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const pt = trackCurve.getPointAt(t);
      const tangent = trackCurve.getTangentAt(t).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

      const linePt = pt.clone().addScaledVector(normal, offset);
      linePt.y = 0.155; // Slightly above track surface to prevent z-fighting
      linePoints.push(linePt);
    }

    const lineCurve = new THREE.CatmullRomCurve3(linePoints, true);
    const lineGeo = new THREE.TubeGeometry(lineCurve, samples, 0.038, 4, true);
    const lineMesh = new THREE.Mesh(lineGeo, lineMat);
    trackGroup.add(lineMesh);
  }

  // Start Line across all 6 lanes at t = 0.12
  const startT = 0.12;
  const startPt = trackCurve.getPointAt(startT);
  const startTan = trackCurve.getTangentAt(startT).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const startNorm = new THREE.Vector3().crossVectors(startTan, up).normalize();

  const startLineGeo = new THREE.PlaneGeometry(trackWidth, 0.6);
  startLineGeo.rotateX(-Math.PI / 2);
  const startLineMesh = new THREE.Mesh(startLineGeo, lineMat);
  startLineMesh.position.copy(startPt);
  startLineMesh.position.y = 0.16;
  startLineMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), startTan);
  trackGroup.add(startLineMesh);

  // Staggered Start Marks & Painted Lane Numbers (1, 2, 3, 4, 5, 6)
  for (let l = 0; l < numLanes; l++) {
    const laneCenterOffset = -trackWidth / 2 + (l + 0.5) * laneWidth;
    // Stagger distance: outer lanes start slightly further ahead
    const laneStaggerT = startT - 0.015 + l * 0.003;
    const numPt = trackCurve.getPointAt(laneStaggerT).addScaledVector(startNorm, laneCenterOffset);
    numPt.y = 0.165;

    // Canvas texture for lane number
    const numTex = createLaneNumberTexture(l + 1);
    const numPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0, 1.8),
      new THREE.MeshBasicMaterial({ map: numTex, transparent: true })
    );
    numPlane.rotation.x = -Math.PI / 2;
    numPlane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), startTan);
    numPlane.position.copy(numPt);
    trackGroup.add(numPlane);
  }

  scene.add(trackGroup);
}

function createLaneNumberTexture(number) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 360px "Fredoka", "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/* =========================================================
   6. Infield Soccer Pitch (Stripes, Lines, 3D Goals)
   ========================================================= */
function buildSoccerField() {
  const fieldGroup = new THREE.Group();
  const pitchWidth = 84;
  const pitchHeight = 46;

  // Lawn Stripes (Dual-tone manicured mower pattern)
  const numStripes = 18;
  const stripeW = pitchWidth / numStripes;
  const stripeGeo = new THREE.PlaneGeometry(stripeW, pitchHeight);
  stripeGeo.rotateX(-Math.PI / 2);

  const matGreen1 = new THREE.MeshLambertMaterial({ color: 0x6bbd65 });
  const matGreen2 = new THREE.MeshLambertMaterial({ color: 0x76c970 });

  for (let i = 0; i < numStripes; i++) {
    const stripe = new THREE.Mesh(stripeGeo, i % 2 === 0 ? matGreen1 : matGreen2);
    stripe.position.set(-pitchWidth / 2 + (i + 0.5) * stripeW, 0.05, 0);
    stripe.receiveShadow = true;
    fieldGroup.add(stripe);
  }

  // Regulation White Pitch Boundary Lines
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lineThickness = 0.16;

  function createFieldLine(x1, z1, x2, z2) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.sqrt(dx * dx + dz * dz);
    const lineMesh = new THREE.Mesh(new THREE.PlaneGeometry(length, lineThickness), lineMat);
    lineMesh.rotateX(-Math.PI / 2);
    lineMesh.position.set((x1 + x2) / 2, 0.065, (z1 + z2) / 2);
    lineMesh.rotation.z = Math.atan2(dz, dx);
    fieldGroup.add(lineMesh);
  }

  const pw2 = pitchWidth / 2 - 2;
  const ph2 = pitchHeight / 2 - 2;

  // Outer Touchlines & Goal lines
  createFieldLine(-pw2, -ph2, pw2, -ph2);
  createFieldLine(-pw2, ph2, pw2, ph2);
  createFieldLine(-pw2, -ph2, -pw2, ph2);
  createFieldLine(pw2, -ph2, pw2, ph2);

  // Center Halfway Line
  createFieldLine(0, -ph2, 0, ph2);

  // Center Circle
  const centerCircle = new THREE.Mesh(
    new THREE.RingGeometry(6.5, 6.5 + lineThickness, 48),
    lineMat
  );
  centerCircle.rotateX(-Math.PI / 2);
  centerCircle.position.set(0, 0.065, 0);
  fieldGroup.add(centerCircle);

  // Center Spot
  const centerSpot = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), lineMat);
  centerSpot.rotateX(-Math.PI / 2);
  centerSpot.position.set(0, 0.066, 0);
  fieldGroup.add(centerSpot);

  // Penalty Boxes at both ends
  [-pw2, pw2].forEach((goalX) => {
    const dir = goalX < 0 ? 1 : -1;
    const boxDepth = 12;
    const boxWidth = 22;

    createFieldLine(goalX, -boxWidth / 2, goalX + dir * boxDepth, -boxWidth / 2);
    createFieldLine(goalX, boxWidth / 2, goalX + dir * boxDepth, boxWidth / 2);
    createFieldLine(goalX + dir * boxDepth, -boxWidth / 2, goalX + dir * boxDepth, boxWidth / 2);

    // 3D Soccer Goal with white posts & nets
    buildSoccerGoal(fieldGroup, goalX, 0, dir);
  });

  scene.add(fieldGroup);
}

function buildSoccerGoal(parentGroup, x, z, facingDir) {
  const goalG = new THREE.Group();
  const postMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const netMat = new THREE.MeshBasicMaterial({ color: 0xf5f5f5, wireframe: true, transparent: true, opacity: 0.55 });

  const postRadius = 0.12;
  const postHeight = 3.4;
  const goalWidth = 7.32;
  const goalDepth = 2.4;

  // Left & Right upright posts
  const leftPost = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, postHeight, 8), postMat);
  leftPost.position.set(0, postHeight / 2, -goalWidth / 2);
  leftPost.castShadow = true;
  goalG.add(leftPost);

  const rightPost = leftPost.clone();
  rightPost.position.set(0, postHeight / 2, goalWidth / 2);
  goalG.add(rightPost);

  // Crossbar
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(postRadius, postRadius, goalWidth, 8), postMat);
  crossbar.rotation.x = Math.PI / 2;
  crossbar.position.set(0, postHeight, 0);
  crossbar.castShadow = true;
  goalG.add(crossbar);

  // Net Box
  const netBox = new THREE.Mesh(new THREE.BoxGeometry(goalDepth, postHeight, goalWidth), netMat);
  netBox.position.set(-facingDir * goalDepth / 2, postHeight / 2, 0);
  goalG.add(netBox);

  goalG.position.set(x, 0.05, z);
  parentGroup.add(goalG);
}

/* =========================================================
   7. Curved White Stadium Perimeter Railings
   ========================================================= */
function buildPerimeterRailings() {
  const fenceGroup = new THREE.Group();
  const innerFenceDist = -trackWidth / 2 - 0.55;
  const outerFenceDist = trackWidth / 2 + 0.55;

  const postMat = new THREE.MeshLambertMaterial({ color: 0xf4f6f8 });
  const railMat = new THREE.MeshLambertMaterial({ color: 0xffffff });

  const numPosts = 140;
  const postHeight = 1.25;
  const postGeo = new THREE.CylinderGeometry(0.07, 0.07, postHeight, 6);

  [innerFenceDist, outerFenceDist].forEach((dist) => {
    const railPoints = [];

    for (let i = 0; i <= numPosts; i++) {
      const t = i / numPosts;
      const pt = trackCurve.getPointAt(t);
      const tangent = trackCurve.getTangentAt(t).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const postPos = pt.clone().addScaledVector(normal, dist);

      // Post
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(postPos.x, postHeight / 2, postPos.z);
      post.castShadow = true;
      fenceGroup.add(post);

      // Rail vertex
      railPoints.push(new THREE.Vector3(postPos.x, postHeight, postPos.z));
    }

    const railCurve = new THREE.CatmullRomCurve3(railPoints, true);
    const railGeo = new THREE.TubeGeometry(railCurve, numPosts * 2, 0.055, 6, true);
    const railMesh = new THREE.Mesh(railGeo, railMat);
    railMesh.castShadow = true;
    fenceGroup.add(railMesh);
  });

  scene.add(fenceGroup);
}

/* =========================================================
   8. Stadium Floodlight Towers
   ========================================================= */
function buildStadiumTowers() {
  const towerGroup = new THREE.Group();
  const towerPositions = [
    { x: 42, z: 27, rotY: -Math.PI * 0.75 },
    { x: -42, z: 27, rotY: -Math.PI * 0.25 },
    { x: -42, z: -27, rotY: Math.PI * 0.25 },
    { x: 42, z: -27, rotY: Math.PI * 0.75 }
  ];

  const mastMat = new THREE.MeshLambertMaterial({ color: 0x607d8b });
  const panelMat = new THREE.MeshLambertMaterial({ color: 0x263238 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  towerPositions.forEach((loc) => {
    const tower = new THREE.Group();

    // Steel mast
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 20, 8), mastMat);
    mast.position.y = 10;
    mast.castShadow = true;
    tower.add(mast);

    // Floodlight rack panel
    const panel = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.6, 0.8), panelMat);
    panel.position.set(0, 20, 0);
    panel.rotation.x = 0.38; // Angled down towards track
    panel.castShadow = true;
    tower.add(panel);

    // Glowing face
    const bulbs = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.2), bulbMat);
    bulbs.position.set(0, 20, 0.42);
    bulbs.rotation.x = 0.38;
    tower.add(bulbs);

    // Spotlight in night mode
    const spot = new THREE.SpotLight(0xfff6e5, 0, 85, Math.PI / 3.8, 0.45, 1);
    spot.position.set(loc.x, 20, loc.z);
    spot.target.position.set(loc.x * 0.5, 0, loc.z * 0.5);
    scene.add(spot);
    scene.add(spot.target);
    floodlights.push(spot);

    tower.position.set(loc.x, 0, loc.z);
    tower.rotation.y = loc.rotY;
    towerGroup.add(tower);
  });

  scene.add(towerGroup);
}

/* =========================================================
   9. 3D Banner Arches ("Work", "Resume", "Contact")
   ========================================================= */
function build3DGates() {
  const gatesGroup = new THREE.Group();

  state.gates.forEach((gate) => {
    const pt = trackCurve.getPointAt(gate.t);
    const tangent = trackCurve.getTangentAt(gate.t).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

    const arch = new THREE.Group();
    const archWidth = trackWidth + 0.8;
    const postHeight = 6.4;
    const postMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const finialMat = new THREE.MeshLambertMaterial({ color: gate.color });

    // Left & Right Upright Pillars
    [-archWidth / 2, archWidth / 2].forEach((sideX) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, postHeight, 12), postMat);
      post.position.set(sideX, postHeight / 2, 0);
      post.castShadow = true;
      arch.add(post);

      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 16), finialMat);
      sphere.position.set(sideX, postHeight, 0);
      arch.add(sphere);
    });

    // Banner Board
    const bannerHeight = 2.1;
    const bannerGeo = new THREE.BoxGeometry(archWidth - 0.2, bannerHeight, 0.22);
    const bannerTex = createGateBannerTexture(gate.label, gate.color);
    const bannerMat = new THREE.MeshLambertMaterial({ map: bannerTex, roughness: 0.45 });

    const bannerMesh = new THREE.Mesh(bannerGeo, bannerMat);
    bannerMesh.position.set(0, postHeight - bannerHeight / 2 - 0.2, 0);
    bannerMesh.castShadow = true;
    arch.add(bannerMesh);

    // Align gate across the track
    arch.position.copy(pt);
    const rotMat = new THREE.Matrix4().makeBasis(normal, up, tangent);
    arch.rotation.setFromRotationMatrix(rotMat);

    gatesGroup.add(arch);
  });

  scene.add(gatesGroup);
}

function createGateBannerTexture(title, hexColor) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Background banner
  ctx.fillStyle = '#' + hexColor.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 16;
  ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 128px "Fredoka", "Outfit", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 6;
  ctx.fillText(title, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/* =========================================================
   10. Build Perfectly Aligned 3D Bicycle & Rider
   ========================================================= */
function buildCyclist() {
  bikeGroup = new THREE.Group();

  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.85, roughness: 0.18 });
  const frameMat = new THREE.MeshLambertMaterial({ color: 0xffffff }); // Sleek white bicycle frame
  const rubberMat = new THREE.MeshLambertMaterial({ color: 0x1e1e1e });
  const seatMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const spokeMat = new THREE.MeshStandardMaterial({ color: 0xd0d0d0, metalness: 0.9, roughness: 0.2 });

  const wheelRadius = 0.72;
  const wheelThickness = 0.09;
  const wheelbase = 1.68; // Distance between front & rear axles

  // Realistic Wheel Builder (Tire in YZ plane, Axle along X)
  function createAlignedWheel() {
    const wGroup = new THREE.Group();

    // Tire: Torus rotated by Y = PI/2 puts the wheel circumference in the YZ plane!
    const tire = new THREE.Mesh(
      new THREE.TorusGeometry(wheelRadius, wheelThickness, 10, 32),
      rubberMat
    );
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    wGroup.add(tire);

    // Rim
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(wheelRadius - 0.05, 0.035, 8, 32),
      chromeMat
    );
    rim.rotation.y = Math.PI / 2;
    wGroup.add(rim);

    // Central Wheel Hub (axle along X)
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 12), chromeMat);
    hub.rotation.z = Math.PI / 2;
    wGroup.add(hub);

    // 12 Thin Steel Spokes
    const numSpokes = 12;
    for (let s = 0; s < numSpokes; s++) {
      const angle = (s / numSpokes) * Math.PI;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, wheelRadius * 1.88, 4), spokeMat);
      spoke.rotation.x = angle;
      wGroup.add(spoke);
    }

    return wGroup;
  }

  // Front & Rear Wheels (aligned along local Z axis: front is +Z, rear is -Z)
  frontWheelGroup = createAlignedWheel();
  frontWheelGroup.position.set(0, wheelRadius, wheelbase / 2);
  bikeGroup.add(frontWheelGroup);

  rearWheelGroup = createAlignedWheel();
  rearWheelGroup.position.set(0, wheelRadius, -wheelbase / 2);
  bikeGroup.add(rearWheelGroup);

  // Bike Frame Geometry
  const frameGroup = new THREE.Group();

  function createTube(p1, p2, radius = 0.042, mat = frameMat) {
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 8), mat);
    tube.position.copy(p1).addScaledVector(dir, 0.5);
    tube.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    tube.castShadow = true;
    return tube;
  }

  const bbPos = new THREE.Vector3(0, wheelRadius, -0.12); // Bottom bracket
  const headPos = new THREE.Vector3(0, wheelRadius + 0.92, 0.62); // Head tube
  const seatPos = new THREE.Vector3(0, wheelRadius + 0.82, -0.28); // Seat tube top
  const rearDrop = new THREE.Vector3(0, wheelRadius, -wheelbase / 2);
  const frontDrop = new THREE.Vector3(0, wheelRadius, wheelbase / 2);

  frameGroup.add(createTube(frontDrop, headPos)); // Front Fork
  frameGroup.add(createTube(headPos, bbPos)); // Down Tube
  frameGroup.add(createTube(headPos, seatPos)); // Top Tube
  frameGroup.add(createTube(seatPos, bbPos)); // Seat Tube
  frameGroup.add(createTube(seatPos, rearDrop)); // Seat Stay
  frameGroup.add(createTube(bbPos, rearDrop)); // Chain Stay

  // Handlebars
  const stem = createTube(headPos, headPos.clone().add(new THREE.Vector3(0, 0.16, 0.08)), 0.038, chromeMat);
  frameGroup.add(stem);

  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.88, 8), chromeMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.copy(headPos).add(new THREE.Vector3(0, 0.19, 0.08));
  frameGroup.add(bar);

  // Bicycle Seat / Saddle
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.36), seatMat);
  saddle.position.copy(seatPos).add(new THREE.Vector3(0, 0.07, -0.04));
  saddle.castShadow = true;
  frameGroup.add(saddle);

  // Front Headlight
  const headlight = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.14, 12), chromeMat);
  headlight.rotation.x = Math.PI / 2;
  headlight.position.copy(headPos).add(new THREE.Vector3(0, 0.02, 0.15));
  frameGroup.add(headlight);

  bikeGroup.add(frameGroup);

  // Rotating Crankset & Pedals
  crankGroup = new THREE.Group();
  crankGroup.position.copy(bbPos);

  const leftCrank = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.28, 0.03), chromeMat);
  leftCrank.position.set(-0.16, 0.14, 0);
  crankGroup.add(leftCrank);

  leftPedal = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.075), seatMat);
  leftPedal.position.set(-0.23, 0.28, 0);
  crankGroup.add(leftPedal);

  const rightCrank = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.28, 0.03), chromeMat);
  rightCrank.position.set(0.16, -0.14, 0);
  crankGroup.add(rightCrank);

  rightPedal = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.035, 0.075), seatMat);
  rightPedal.position.set(0.23, -0.28, 0);
  crankGroup.add(rightPedal);

  bikeGroup.add(crankGroup);

  // Cyclist Model (Helmet, Green Backpack, Jersey, Pants)
  const riderGroup = new THREE.Group();

  const skinMat = new THREE.MeshLambertMaterial({ color: 0xffcc80 });
  const jerseyMat = new THREE.MeshLambertMaterial({ color: 0xfafafa });
  const pantsMat = new THREE.MeshLambertMaterial({ color: 0xff7043 }); // Orange pants
  const backpackMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 }); // Green Backpack from screenshot!
  const helmetMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const helmetStripeMat = new THREE.MeshLambertMaterial({ color: 0xff7043 });

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.64, 0.32), jerseyMat);
  torso.position.set(0, wheelRadius + 1.25, -0.14);
  torso.rotation.x = 0.28; // Leaning naturally forward
  torso.castShadow = true;
  riderGroup.add(torso);

  // Green Backpack (Exact match to screenshot)
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.28), backpackMat);
  backpack.position.set(0, wheelRadius + 1.25, -0.34);
  backpack.rotation.x = 0.28;
  backpack.castShadow = true;
  riderGroup.add(backpack);

  // Head & Helmet
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 14), skinMat);
  head.position.set(0, wheelRadius + 1.72, 0.02);
  riderGroup.add(head);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.245, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.68), helmetMat);
  helmet.position.copy(head.position).add(new THREE.Vector3(0, 0.05, 0));
  helmet.castShadow = true;
  riderGroup.add(helmet);

  const helmetStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.248, 0.248, 0.07, 16, 1, true), helmetStripeMat);
  helmetStripe.position.copy(helmet.position);
  riderGroup.add(helmetStripe);

  // Arms reaching to Handlebars
  [-0.24, 0.24].forEach((sideX) => {
    const arm = createTube(
      new THREE.Vector3(sideX, wheelRadius + 1.45, -0.06),
      new THREE.Vector3(sideX * 1.12, wheelRadius + 1.10, 0.68),
      0.058,
      jerseyMat
    );
    riderGroup.add(arm);
  });

  // Animated Legs attached to pedals
  function createLeg(sideX) {
    const legG = new THREE.Group();
    const upperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.54, 6), pantsMat);
    upperLeg.position.set(0, -0.27, 0);
    upperLeg.castShadow = true;
    legG.add(upperLeg);
    legG.position.set(sideX, wheelRadius + 0.85, -0.2);
    return legG;
  }

  riderLeftLeg = createLeg(-0.17);
  riderRightLeg = createLeg(0.17);
  riderGroup.add(riderLeftLeg);
  riderGroup.add(riderRightLeg);

  bikeGroup.add(riderGroup);

  // Position bike in Lane 3
  updateBikePositionAndOrientation();

  scene.add(bikeGroup);
}

/* =========================================================
   11. Position Bike & Align Initial Camera
   ========================================================= */
function updateBikePositionAndOrientation() {
  if (!bikeGroup || !trackCurve) return;

  const centerPt = trackCurve.getPointAt(state.trackDistance);
  const tangent = trackCurve.getTangentAt(state.trackDistance).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

  // Position bike precisely in Lane 3
  const bikePos = centerPt.clone().addScaledVector(normal, bikeLaneOffset);
  bikeGroup.position.copy(bikePos);

  // Curvature banking into turns
  const nextT = (state.trackDistance + 0.01) % 1;
  const nextTan = trackCurve.getTangentAt(nextT).normalize();
  const turnAngle = tangent.clone().cross(nextTan).y;
  const rollAngle = THREE.MathUtils.clamp(-turnAngle * 65 * (state.velocity / state.maxSpeed), -0.22, 0.22);

  // Local Z is forward along tangent, Local X is along normal, Local Y is Up
  const rotMatrix = new THREE.Matrix4().makeBasis(normal, up, tangent);
  bikeGroup.quaternion.setFromRotationMatrix(rotMatrix);
  bikeGroup.rotateZ(rollAngle);
}

let currentCamPos = new THREE.Vector3();
let currentCamLook = new THREE.Vector3();

function alignCameraInitial() {
  const centerPt = trackCurve.getPointAt(state.trackDistance);
  const tangent = trackCurve.getTangentAt(state.trackDistance).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
  const bikePos = centerPt.clone().addScaledVector(normal, bikeLaneOffset);

  // Camera looking down track over rider's right shoulder (matching reference image)
  const camOffset = new THREE.Vector3()
    .copy(normal).multiplyScalar(5.5)
    .add(new THREE.Vector3(0, 10.5, 0))
    .addScaledVector(tangent, -18);

  currentCamPos = bikePos.clone().add(camOffset);
  currentCamLook = bikePos.clone().addScaledVector(tangent, 8).add(new THREE.Vector3(0, 1.4, 0));

  camera.position.copy(currentCamPos);
  camera.lookAt(currentCamLook);
}

/* =========================================================
   12. Floating Petals & Atmospheric Particles
   ========================================================= */
function buildFloatingParticles() {
  const count = 180;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 120;
    positions[i * 3 + 1] = 1.0 + Math.random() * 10;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 120;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffb6c1';
  ctx.beginPath();
  ctx.arc(16, 16, 12, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.PointsMaterial({
    size: 0.55,
    map: tex,
    transparent: true,
    opacity: 0.75,
    depthWrite: false
  });

  particlesSystem = new THREE.Points(geo, mat);
  scene.add(particlesSystem);
}

/* =========================================================
   13. Web Audio Synthesis (Bell & Tire)
   ========================================================= */
function initAudio() {
  if (state.audioContext) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new AudioContext();

    const bufferSize = state.audioContext.sampleRate * 2;
    const noiseBuffer = state.audioContext.createBuffer(1, bufferSize, state.audioContext.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = state.audioContext.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    state.tireFilter = state.audioContext.createBiquadFilter();
    state.tireFilter.type = 'lowpass';
    state.tireFilter.frequency.value = 350;

    state.tireGain = state.audioContext.createGain();
    state.tireGain.gain.value = 0.0;

    whiteNoise.connect(state.tireFilter);
    state.tireFilter.connect(state.tireGain);
    state.tireGain.connect(state.audioContext.destination);

    whiteNoise.start(0);
  } catch (err) {
    console.warn('AudioContext warning:', err);
  }
}

function playBicycleBell() {
  if (!state.audioEnabled) enableAudio();
  if (!state.audioContext) return;
  if (state.audioContext.state === 'suspended') state.audioContext.resume();

  const now = state.audioContext.currentTime;
  const ring = (offset, freq) => {
    const osc = state.audioContext.createOscillator();
    const gain = state.audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, offset);
    gain.gain.setValueAtTime(0, offset);
    gain.gain.linearRampToValueAtTime(0.35, offset + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, offset + 0.85);
    osc.connect(gain);
    gain.connect(state.audioContext.destination);
    osc.start(offset);
    osc.stop(offset + 0.9);
  };

  ring(now, 2080);
  ring(now + 0.09, 2480);

  triggerBellVisualWave();
}

function enableAudio() {
  initAudio();
  if (state.audioContext && state.audioContext.state === 'suspended') {
    state.audioContext.resume();
  }
  state.audioEnabled = true;
  soundIconOn.style.display = 'block';
  soundIconOff.style.display = 'none';
  soundTooltip.style.opacity = '0';
  setTimeout(() => { soundTooltip.style.display = 'none'; }, 300);
}

function disableAudio() {
  state.audioEnabled = false;
  if (state.tireGain) state.tireGain.gain.value = 0;
  soundIconOn.style.display = 'none';
  soundIconOff.style.display = 'block';
}

function triggerBellVisualWave() {
  const container = document.getElementById('bell-ripple-container');
  const wave = document.createElement('div');
  wave.className = 'bell-ding-wave';
  wave.style.left = '50%';
  wave.style.top = '50%';
  wave.style.width = '140px';
  wave.style.height = '140px';
  container.appendChild(wave);
  setTimeout(() => wave.remove(), 750);
}

/* =========================================================
   14. Highly Responsive Scroll & Keyboard Physics
   ========================================================= */
function setupEventListeners() {
  // 1. Mouse Wheel / Trackpad Scroll:
  // "2 scroll per cycle aage jaye"
  // Each scroll gives immediate substantial travel forward!
  window.addEventListener('wheel', (e) => {
    e.preventDefault();

    // Wheel delta: e.deltaY < 0 is scroll up, e.deltaY > 0 is scroll down
    const direction = state.scrollDirectionInverted ? (e.deltaY > 0 ? 1 : -1) : (e.deltaY < 0 ? 1 : -1);

    // High responsiveness: 2 scrolls drives cycle smoothly down the track!
    const impulse = state.scrollSensitivity * (Math.abs(e.deltaY) > 60 ? 1.4 : 1.0);
    state.targetVelocity = THREE.MathUtils.clamp(
      state.targetVelocity + direction * impulse,
      -state.maxSpeed,
      state.maxSpeed
    );
    state.velocity += direction * (impulse * 0.45);
  }, { passive: false });

  // Invert scroll toggle
  toggleScrollBtn.addEventListener('click', () => {
    state.scrollDirectionInverted = !state.scrollDirectionInverted;
    scrollModeLabel.textContent = state.scrollDirectionInverted ? 'Scroll: Down = Forward' : 'Scroll: Up = Forward';
  });

  // 2. Keyboard Controls (W, S, Shift, Arrows, E)
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') {
      keysDown.w = true;
      highlightKey('W', true);
    }
    if (k === 's' || k === 'arrowdown') {
      keysDown.s = true;
      highlightKey('S', true);
    }
    if (e.shiftKey) {
      keysDown.shift = true;
      highlightKey('Shift', true);
    }
    if (k === 'e' || k === ' ') {
      playBicycleBell();
      highlightKey('E', true);
    }
    if (k === 'escape') closeModal();
  });

  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') {
      keysDown.w = false;
      highlightKey('W', false);
    }
    if (k === 's' || k === 'arrowdown') {
      keysDown.s = false;
      highlightKey('S', false);
    }
    if (!e.shiftKey) {
      keysDown.shift = false;
      highlightKey('Shift', false);
    }
    if (k === 'e' || k === ' ') highlightKey('E', false);
  });

  function highlightKey(text, active) {
    document.querySelectorAll('.key-cap').forEach(cap => {
      if (cap.textContent.trim().toUpperCase() === text.toUpperCase()) {
        if (active) cap.classList.add('active');
        else cap.classList.remove('active');
      }
    });
  }

  // 3. Touch Drag
  let touchStartY = null;
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) touchStartY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (touchStartY !== null && e.touches.length > 0) {
      const currentY = e.touches[0].clientY;
      const diff = touchStartY - currentY;
      touchStartY = currentY;
      state.targetVelocity += diff * 0.00035;
    }
  }, { passive: true });

  window.addEventListener('touchend', () => { touchStartY = null; });

  // 4. Dock Buttons
  document.getElementById('dockWorkBtn').addEventListener('click', () => travelToGate('work'));
  document.getElementById('dockResumeBtn').addEventListener('click', () => travelToGate('resume'));
  document.getElementById('dockContactBtn').addEventListener('click', () => travelToGate('contact'));
  document.getElementById('dockAboutBtn').addEventListener('click', () => openModal('about'));
  document.getElementById('dockIdeasBtn').addEventListener('click', () => openModal('work'));

  const boostBtn = document.getElementById('dockBoostBtn');
  boostBtn.addEventListener('click', () => {
    state.targetVelocity = state.maxSpeed * 1.5;
    boostBtn.classList.add('active');
    setTimeout(() => boostBtn.classList.remove('active'), 500);
  });

  soundBtn.addEventListener('click', () => {
    if (state.audioEnabled) disableAudio();
    else enableAudio();
  });

  themeBtn.addEventListener('click', toggleTheme);
  modalCloseBtn.addEventListener('click', closeModal);
  sectionModal.addEventListener('click', (e) => {
    if (e.target === sectionModal) closeModal();
  });

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

/* =========================================================
   15. Theme Atmosphere (Day, Sunset, Night)
   ========================================================= */
function toggleTheme() {
  state.themeIndex = (state.themeIndex + 1) % state.themes.length;
  const cur = state.themes[state.themeIndex];

  scene.background.setHex(cur.sky);
  scene.fog.color.setHex(cur.fog);
  sunLight.color.setHex(cur.light);
  sunLight.intensity = cur.intensity;

  const isNight = cur.name === 'night';
  floodlights.forEach(spot => { spot.intensity = isNight ? 2.8 : 0; });

  const icon = document.getElementById('themeIcon');
  if (cur.name === 'day') {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
  } else if (cur.name === 'sunset') {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line>';
  } else {
    icon.innerHTML = '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>';
  }
}

/* =========================================================
   16. Modals & Travel
   ========================================================= */
function openModal(id) {
  document.getElementById('modalWork').style.display = 'none';
  document.getElementById('modalResume').style.display = 'none';
  document.getElementById('modalContact').style.display = 'none';
  document.getElementById('modalAbout').style.display = 'none';

  const target = document.getElementById(`modal${id.charAt(0).toUpperCase() + id.slice(1)}`);
  if (target) target.style.display = 'block';

  sectionModal.classList.add('open');
  state.activeModalSection = id;
}

function closeModal() {
  sectionModal.classList.remove('open');
  state.activeModalSection = null;
}

function travelToGate(gateId) {
  const gate = state.gates.find(g => g.id === gateId);
  if (!gate) return;

  const targetT = (gate.t - 0.035 + 1.0) % 1.0;
  const diff = ((targetT - state.trackDistance + 1.5) % 1.0) - 0.5;
  state.targetVelocity = Math.sign(diff) * state.maxSpeed;

  setTimeout(() => openModal(gateId), 1200);
}

function checkGateArrival() {
  state.gates.forEach(gate => {
    const d = Math.abs(state.trackDistance - gate.t);
    if (d < 0.02) {
      if (state.lastVisitedGate !== gate.id && Math.abs(state.velocity) > 0.001) {
        state.lastVisitedGate = gate.id;
        playBicycleBell();
      }
    } else if (d > 0.08 && state.lastVisitedGate === gate.id) {
      state.lastVisitedGate = null;
    }
  });
}

/* =========================================================
   17. Animation & Physics Loop
   ========================================================= */
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.1);

  // Keyboard acceleration
  let topSpeed = state.maxSpeed;
  if (keysDown.shift) topSpeed *= 1.6;

  if (keysDown.w) {
    state.targetVelocity += state.acceleration * (keysDown.shift ? 1.8 : 1.0);
  } else if (keysDown.s) {
    state.targetVelocity -= state.acceleration;
  }

  // Smooth Momentum & Friction
  state.velocity += (state.targetVelocity - state.velocity) * 0.14;
  state.velocity *= state.friction;
  state.targetVelocity *= 0.90;

  state.velocity = THREE.MathUtils.clamp(state.velocity, -topSpeed, topSpeed);

  // Advance Track Position
  state.trackDistance += state.velocity;
  if (state.trackDistance >= 1.0) state.trackDistance -= 1.0;
  if (state.trackDistance < 0) state.trackDistance += 1.0;

  checkGateArrival();

  // Update 3D Bike & Camera Chase
  updateBikeAndCameraChase(delta);

  // Update Particles
  if (particlesSystem) {
    const pos = particlesSystem.geometry.attributes.position.array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] += Math.sin(pos[i + 1] * 0.4) * 0.02;
      pos[i + 1] -= 0.018;
      pos[i + 2] += Math.cos(pos[i + 1] * 0.4) * 0.02;
      if (pos[i + 1] < 0.2) pos[i + 1] = 10 + Math.random() * 4;
    }
    particlesSystem.geometry.attributes.position.needsUpdate = true;
  }

  // Update Audio
  if (state.audioEnabled && state.tireGain) {
    const spd = Math.abs(state.velocity) / state.maxSpeed;
    state.tireGain.gain.setTargetAtTime(spd * 0.22, state.audioContext.currentTime, 0.08);
    state.tireFilter.frequency.setTargetAtTime(220 + spd * 750, state.audioContext.currentTime, 0.08);
  }

  // Update Telemetry
  const kmh = (Math.abs(state.velocity) * 4200).toFixed(1);
  speedValueEl.textContent = kmh;
  trackIndicatorEl.style.left = `${(state.trackDistance * 100).toFixed(1)}%`;

  renderer.render(scene, camera);
}

function updateBikeAndCameraChase(delta) {
  updateBikePositionAndOrientation();

  // Wheels & Pedals rotation (rolling along local X axis)
  const wheelRadius = 0.72;
  const angularDist = (state.velocity * trackLength) / wheelRadius;

  if (frontWheelGroup && rearWheelGroup) {
    frontWheelGroup.rotateX(-angularDist);
    rearWheelGroup.rotateX(-angularDist);
  }

  if (crankGroup) {
    crankGroup.rotateX(-angularDist);
    if (leftPedal) leftPedal.rotation.x = angularDist;
    if (rightPedal) rightPedal.rotation.x = angularDist;
  }

  // Rider Pedaling Legs
  if (riderLeftLeg && riderRightLeg) {
    const cycle = (state.trackDistance * trackLength) / (wheelRadius * 2);
    riderLeftLeg.rotation.x = Math.sin(cycle) * 0.45;
    riderRightLeg.rotation.x = -Math.sin(cycle) * 0.45;
  }

  // Camera Chase: Positioned behind and above the rider in Lane 3
  const centerPt = trackCurve.getPointAt(state.trackDistance);
  const tangent = trackCurve.getTangentAt(state.trackDistance).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();
  const bikePos = centerPt.clone().addScaledVector(normal, bikeLaneOffset);

  const targetCamPos = bikePos.clone()
    .addScaledVector(normal, 5.5)
    .add(new THREE.Vector3(0, 10.5, 0))
    .addScaledVector(tangent, -18);

  const targetLook = bikePos.clone()
    .addScaledVector(tangent, 8)
    .add(new THREE.Vector3(0, 1.4, 0));

  currentCamPos.lerp(targetCamPos, 0.09);
  currentCamLook.lerp(targetLook, 0.09);

  camera.position.copy(currentCamPos);
  camera.lookAt(currentCamLook);
}

// Start on DOM ready
window.addEventListener('DOMContentLoaded', initScene);
