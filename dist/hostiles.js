import * as THREE from 'three';

export const HOSTILE_COUNT = 48;
export const FLASH_DURATION = 0.62;

export function createHostileSatellites(system, renderer, shield, onChange = () => {}) {
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.Float32BufferAttribute(new Float32Array(HOSTILE_COUNT * 3), 3);
  const sizes = new THREE.Float32BufferAttribute(new Float32Array(HOSTILE_COUNT), 1);
  const flares = new THREE.Float32BufferAttribute(new Float32Array(HOSTILE_COUNT), 1);
  const opacity = new THREE.Float32BufferAttribute(new Float32Array(HOSTILE_COUNT), 1);
  for (const attribute of [positions, sizes, flares, opacity]) attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positions);
  geometry.setAttribute('size', sizes);
  geometry.setAttribute('flare', flares);
  geometry.setAttribute('opacity', opacity);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.7);
  const material = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `
      attribute float size;
      attribute float flare;
      attribute float opacity;
      uniform float pixelRatio;
      varying float vFlare;
      varying float vOpacity;
      void main() {
        vFlare = flare;
        vOpacity = opacity;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * pixelRatio;
      }
    `,
    fragmentShader: `
      varying float vFlare;
      varying float vOpacity;
      void main() {
        vec2 p = (gl_PointCoord - 0.5) * 2.0;
        float d = length(p);
        if (d > 1.0 || vOpacity < 0.001) discard;
        float halo = exp(-d * d * 10.0) * (0.48 + vFlare * 0.65);
        float core = 1.0 - smoothstep(0.035, 0.16, d);
        float rays = (exp(-abs(p.x) * 65.0) + exp(-abs(p.y) * 65.0)) * pow(1.0 - d, 2.0) * vFlare * 0.3;
        vec3 red = vec3(1.0, 0.045, 0.075);
        vec3 color = mix(red, vec3(1.0, 0.83, 0.48), vFlare);
        color = mix(color, vec3(1.0, 0.94, 0.76), core * (0.22 + vFlare * 0.7));
        gl_FragColor = vec4(color, (halo + core + rays) * vOpacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  const dots = new THREE.Points(geometry, material);
  dots.name = 'red-hostile-satellites';
  system.add(dots);

  const axisX = new THREE.Vector3(1, 0, 0);
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisZ = new THREE.Vector3(0, 0, 1);
  const satellites = Array.from({ length: HOSTILE_COUNT }, (_, index) => {
    const normal = axisY.clone()
      .applyAxisAngle(axisX, (19 + index * 37 % 143) * Math.PI / 180)
      .applyAxisAngle(axisY, index * 2.3999632297)
      .applyAxisAngle(axisX, 0.42);
    const u = new THREE.Vector3().crossVectors(Math.abs(normal.z) < 0.9 ? axisZ : axisX, normal).normalize()
      .applyAxisAngle(normal, index * 1.6180339887);
    const v = new THREE.Vector3().crossVectors(normal, u).normalize();
    const perigee = 1.046 + index % 4 * 0.004;
    const apogee = 1.28 + index % 8 * 0.042;
    const a = (perigee + apogee) / 2;
    const eccentricity = (apogee - perigee) / (apogee + perigee);
    return {
      u, v, a, eccentricity, b: a * Math.sqrt(1 - eccentricity * eccentricity),
      phase: index * 2.3999632297,
      speed: 0.22 + (index * 7 % 9) * 0.012,
      position: new THREE.Vector3(), previous: new THREE.Vector3(),
      state: 'active', hitAt: 0, initialized: false,
    };
  });
  const hitPoint = new THREE.Vector3();
  let epoch = 0;
  let lastState = '';
  let previousTime = null;

  function getState() {
    let active = 0, flashing = 0, destroyed = 0;
    for (const satellite of satellites) {
      if (satellite.state === 'active') active++;
      else if (satellite.state === 'flashing') flashing++;
      else destroyed++;
    }
    return { active, flashing, destroyed, total: HOSTILE_COUNT };
  }

  function announce() {
    const state = getState();
    const signature = `${state.active}:${state.flashing}:${state.destroyed}`;
    if (signature !== lastState) {
      lastState = signature;
      onChange(state);
    }
  }

  function update(nowSeconds, reducedMotion = false) {
    material.uniforms.pixelRatio.value = renderer.getPixelRatio();
    const startTime = previousTime ?? nowSeconds;
    for (let index = 0; index < satellites.length; index++) {
      const satellite = satellites[index];
      if (satellite.state === 'active') {
        satellite.previous.copy(satellite.position);
        const phase = satellite.phase + (nowSeconds - epoch) * satellite.speed;
        satellite.position.copy(satellite.u).multiplyScalar(satellite.a * (Math.cos(phase) - satellite.eccentricity))
          .addScaledVector(satellite.v, satellite.b * Math.sin(phase));
        if (!satellite.initialized) satellite.previous.copy(satellite.position);
        satellite.initialized = true;
        // These elliptical paths actually cross the mesh altitude. Distant
        // red dots are never removed just because they overlap on the screen.
        if (shield.intersectSegment(satellite.previous, satellite.position, nowSeconds, hitPoint, startTime)) {
          satellite.state = reducedMotion ? 'destroyed' : 'flashing';
          satellite.hitAt = nowSeconds;
          satellite.position.copy(hitPoint);
        }
      }
      let flare = 0, alpha = 1, size = 20;
      if (satellite.state === 'flashing') {
        const age = nowSeconds - satellite.hitAt;
        if (age >= FLASH_DURATION || reducedMotion) satellite.state = 'destroyed';
        else {
          flare = Math.sin(Math.min(age / 0.14, 1) * Math.PI / 2);
          alpha = age < 0.14 ? 1 : Math.pow(1 - (age - 0.14) / (FLASH_DURATION - 0.14), 1.5);
          size = 20 + flare * 30;
        }
      }
      if (satellite.state === 'destroyed') { alpha = 0; size = 0; }
      positions.setXYZ(index, satellite.position.x, satellite.position.y, satellite.position.z);
      sizes.setX(index, size);
      flares.setX(index, flare);
      opacity.setX(index, alpha);
    }
    for (const attribute of [positions, sizes, flares, opacity]) attribute.needsUpdate = true;
    previousTime = nowSeconds;
    announce();
  }

  function reset(nowSeconds = 0) {
    epoch = nowSeconds;
    previousTime = nowSeconds;
    for (const satellite of satellites) {
      satellite.state = 'active';
      satellite.hitAt = 0;
      satellite.initialized = false;
    }
    update(nowSeconds);
  }

  return { update, reset, getState };
}
