import * as THREE from 'three';
import { createSpaceBackground } from './background.js';
import { createOrbitalShield } from './shield.js';
import { attachShieldInteraction } from './shield-input.js';
import { createHostileSatellites } from './hostiles.js';

const canvas = document.querySelector('#space');
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let renderer;

// The static image remains visible when WebGL is unavailable.
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setClearColor(0x020408, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  start().catch((error) => { console.warn('Earth scene unavailable.', error); renderer.dispose(); });
} catch (error) {
  console.warn('WebGL unavailable; displaying still Earth.', error);
}

async function start() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  camera.position.set(0, 0, 5.9);
  const loader = new THREE.TextureLoader();
  const [day, night, clouds, nebulaTexture] = await Promise.all([
    loader.loadAsync('./assets/earth-day.jpg'),
    loader.loadAsync('./assets/earth-night.jpg'),
    loader.loadAsync('./assets/earth-clouds.jpg'),
    loader.loadAsync('./assets/nebula.png'),
  ]);
  // Texture data is converted to linear light explicitly in the shader.
  for (const texture of [day, night]) {
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  const system = new THREE.Group();
  system.rotation.z = -0.10;
  scene.add(system);
  const earthGroup = new THREE.Group();
  // Start with Europe, Africa, and the Middle East facing the viewer.
  earthGroup.rotation.y = -1.88;
  earthGroup.rotation.x = 0.42;
  system.add(earthGroup);

  // An unseen sun circles in the view plane while the camera tracks Earth.
  // The day/night boundary travels around the globe, preserving a half-lit view.
  const earthRotationSpeed = 0.032;
  const solarOrbitSpeed = 0.016;
  const initialSolarAngle = Math.atan2(0.95, -1.76);
  const sunDirection = new THREE.Vector3(
    Math.cos(initialSolarAngle), Math.sin(initialSolarAngle), 0,
  );
  const earthMaterial = new THREE.ShaderMaterial({
    uniforms: {
      dayMap: { value: day },
      nightMap: { value: night },
      cloudMap: { value: clouds },
      sunDirection: { value: sunDirection },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vUv = uv;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D dayMap;
      uniform sampler2D nightMap;
      uniform sampler2D cloudMap;
      uniform vec3 sunDirection;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vPosition;
      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDirection = normalize(cameraPosition - vPosition);
        float sun = dot(normal, sunDirection);
        vec3 surface = pow(texture2D(dayMap, vUv).rgb, vec3(2.2));
        vec3 nightSample = texture2D(nightMap, vUv).rgb;
        float land = smoothstep(0.055, 0.26, dot(surface, vec3(0.25, 0.65, 0.10)));
        float daylight = smoothstep(-0.11, 0.11, sun);
        float irradiance = pow(max(sun, 0.0), 0.65);
        vec3 darkSurface = mix(vec3(0.0008, 0.0020, 0.0050), vec3(0.0045, 0.0080, 0.0160), land);
        float terrain = dot(surface, vec3(0.2126, 0.7152, 0.0722));
        vec3 litSurface = mix(surface, vec3(terrain) * vec3(0.45, 0.51, 0.79), 0.32);
        vec3 sunlight = vec3(1.02, 0.88, 0.98);
        vec3 color = darkSurface + litSurface * sunlight * (0.014 + irradiance * 0.85);
        float lights = max(nightSample.r, max(nightSample.g, nightSample.b));
        lights = pow(smoothstep(0.012, 0.7, lights), 0.8);
        float nightAmount = 1.0 - daylight * 0.96;
        vec3 gold = mix(vec3(1.0, 0.36, 0.045), vec3(1.0, 0.66, 0.22), lights);
        color += gold * lights * nightAmount * 1.8;
        float cloud = pow(texture2D(cloudMap, vUv).r, 1.9);
        color = mix(color, vec3(0.65, 0.63, 0.76) * (0.008 + irradiance * 0.62), cloud * 0.48);
        float rim = pow(1.0 - max(dot(normal, viewDirection), 0.0), 4.0);
        vec3 rimColor = mix(vec3(0.015, 0.04, 0.10), vec3(0.18, 0.26, 0.48), daylight);
        float twilight = exp(-pow(sun * 6.0, 2.0));
        color += (rimColor + vec3(0.18, 0.065, 0.09) * twilight) * rim * (0.25 + daylight * 0.65);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), earthMaterial);
  earthGroup.add(earth);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.045, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { sunDirection: { value: sunDirection } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(mat3(modelMatrix) * normal);
          vec4 p = modelMatrix * vec4(position, 1.0);
          vPosition = p.xyz;
          gl_Position = projectionMatrix * viewMatrix * p;
        }
      `,
      fragmentShader: `
        uniform vec3 sunDirection;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDirection = normalize(cameraPosition - vPosition);
          float edge = pow(max(0.0, dot(normal, viewDirection)), 2.6);
          float sun = dot(normal, sunDirection);
          float lighting = 0.10 + 0.90 * smoothstep(-0.15, 0.65, sun);
          vec3 color = mix(vec3(0.07, 0.22, 0.50), vec3(0.44, 0.24, 0.48), smoothstep(0.05, 0.7, sun));
          gl_FragColor = vec4(color, edge * 0.70 * lighting);
        }
      `,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  system.add(atmosphere);

  const background = createSpaceBackground(scene, renderer, nebulaTexture);
  const pointVertex = `
    attribute float size;
    varying vec3 vColor;
    uniform float pixelRatio;
    void main() {
      vColor = color;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = size * pixelRatio;
    }
  `;
  const satellites = [];
  // Orbits share the axial tilt, but do not rotate with the planet's surface.
  const orbitRoot = new THREE.Group();
  orbitRoot.rotation.x = 0.42;
  system.add(orbitRoot);
  const orbitalPaths = [
    { inclination: 0, node: 0, radius: 1.116, count: 4, redIndex: -1, phase: 12 },
    { inclination: 28, node: 25, radius: 1.209, count: 3, redIndex: -1, phase: 51 },
    { inclination: 53, node: 135, radius: 1.302, count: 3, redIndex: -1, phase: 107 },
    { inclination: 72, node: 245, radius: 1.4136, count: 2, redIndex: -1, phase: 34 },
    { inclination: 90, node: 80, radius: 1.2648, count: 2, redIndex: -1, phase: 143 },
    { inclination: 90, node: 170, radius: 1.5345, count: 2, redIndex: 0, phase: 76 },
    { inclination: 116, node: 40, radius: 1.4601, count: 2, redIndex: 1, phase: 201 },
    { inclination: 145, node: 215, radius: 1.5996, count: 2, redIndex: 0, phase: 309 },
  ];
  const dotMaterial = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: renderer.getPixelRatio() } },
    vertexColors: true,
    vertexShader: pointVertex,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float halo = exp(-d * d * 9.0) * 0.40;
        float core = 1.0 - smoothstep(0.025, 0.16, d);
        vec3 coreColor = mix(vColor, vec3(1.0), 0.28);
        gl_FragColor = vec4(mix(vColor, coreColor, core), halo + core);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  for (const orbit of orbitalPaths) {
    const plane = new THREE.Group();
    const normal = new THREE.Vector3(0, 1, 0)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(orbit.inclination))
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(orbit.node));
    plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    orbitRoot.add(plane);
    const points = [];
    for (let i = 0; i < 256; i++) {
      const angle = i / 256 * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(angle) * orbit.radius, Math.sin(angle) * orbit.radius, 0));
    }
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0x668cae, transparent: true, opacity: 0.13, depthWrite: false }),
    );
    plane.add(ring);
    for (let i = 0; i < orbit.count; i++) {
      if (i === orbit.redIndex) continue;
      const pointGeometry = new THREE.BufferGeometry();
      pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
      pointGeometry.setAttribute('color', new THREE.Float32BufferAttribute([0.19, 0.62, 1], 3));
      pointGeometry.setAttribute('size', new THREE.Float32BufferAttribute([20], 1));
      const dot = new THREE.Points(pointGeometry, dotMaterial);
      plane.add(dot);
      satellites.push({
        dot,
        radius: orbit.radius,
        speed: 0.11 / Math.pow(orbit.radius, 1.5),
        phase: THREE.MathUtils.degToRad(orbit.phase) + i / orbit.count * Math.PI * 2,
      });
    }
  }

  const shield = createOrbitalShield(system, renderer);
  const hostiles = createHostileSatellites(system, renderer, shield, state => {
    canvas.dataset.hostileSatellites = String(state.active + state.flashing);
    canvas.dataset.hostileFlashes = String(state.flashing);
    canvas.dataset.hostilesDestroyed = String(state.destroyed);
  });

  function resize() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    camera.aspect = width / height;
    // Keep the entire globe AND its outermost orbit inside the viewport.
    const verticalHalfAngle = THREE.MathUtils.degToRad(camera.fov / 2);
    const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * camera.aspect);
    camera.position.z = 1.90 / Math.sin(Math.min(verticalHalfAngle, horizontalHalfAngle));
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    background.resize(width, height);
    if (canvas.classList.contains('ready') && motionQuery.matches) renderer.render(scene, camera);
  }
  resize();
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(document.querySelector('#universe'));

  let elapsed = 0;
  let previousTime = 0;
  let paused = false;
  let frame;
  const pointer = new THREE.Vector2();
  const movement = new THREE.Vector2();
  attachShieldInteraction({
    canvas, camera, system, shield,
    getTime: () => elapsed,
    onReset: () => hostiles.reset(elapsed),
    isStatic: () => motionQuery.matches || paused,
    invalidate: () => {
      if (motionQuery.matches || paused) {
        shield.update(elapsed, true);
        hostiles.update(elapsed, true);
        renderer.render(scene, camera);
      }
    },
  });
  window.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    pointer.set((event.clientX / innerWidth - 0.5) * 0.018, (event.clientY / innerHeight - 0.5) * 0.012);
  }, { passive: true });
  document.addEventListener('pointerleave', () => pointer.set(0, 0));
  // Space pauses motion without adding interface chrome to the landing page.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      paused = !paused;
    }
  });

  function render(time = 0) {
    frame = undefined;
    const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
    previousTime = time;
    if (!motionQuery.matches && !paused) elapsed += delta;
    earthGroup.rotation.y = -1.88 + elapsed * earthRotationSpeed;
    const solarAngle = initialSolarAngle + elapsed * solarOrbitSpeed;
    sunDirection.set(Math.cos(solarAngle), Math.sin(solarAngle), 0);
    for (const satellite of satellites) {
      const phase = satellite.phase + elapsed * satellite.speed;
      satellite.dot.position.set(Math.cos(phase) * satellite.radius, Math.sin(phase) * satellite.radius, 0);
    }
    if (!motionQuery.matches && !paused) {
      movement.lerp(pointer, 0.025);
      system.rotation.y = movement.x;
      system.rotation.x = movement.y;
    }
    background.update(elapsed, movement);
    shield.update(elapsed, motionQuery.matches || paused);
    hostiles.update(elapsed, motionQuery.matches || paused);
    renderer.render(scene, camera);
    if (!document.hidden && !motionQuery.matches) frame = requestAnimationFrame(render);
  }
  const resume = () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    previousTime = 0;
    if (!document.hidden) render();
  };
  document.addEventListener('visibilitychange', resume);
  motionQuery.addEventListener('change', resume);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    canvas.classList.remove('ready');
  });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
  render();
  canvas.classList.add('ready');
}
