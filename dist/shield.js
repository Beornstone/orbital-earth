import * as THREE from 'three';
import { createShieldTopology, chooseShieldOrbit, SHIELD_RADIUS, SHIELD_ORBITS, PATCH_ANGLE, SATELLITES_PER_ORBIT } from './shield-geometry.js';

export const SATELLITE_SPEED = 0.17;
const SATELLITE_RADIUS = SHIELD_RADIUS + 0.009;
const MAX_SATELLITES = SHIELD_ORBITS.length * SATELLITES_PER_ORBIT;
const CONTACT_TOLERANCE = 0.006;
const REVEAL_RATE = 0.35;

export function createOrbitalShield(system, renderer) {
  // One canonical cap is shared by every satellite. Its actual vertices,
  // hexagonal cells, and collision boundaries rotate together as a rigid body.
  const topology = createShieldTopology();
  const selected = new Set();
  const cells = topology.cells.filter((cell, index) => {
    if (cell.center.z < Math.cos(PATCH_ANGLE)) return false;
    selected.add(index);
    return true;
  });
  const boundaries = cells.map(cell => cell.corners.map((point, index) =>
    new THREE.Vector3().crossVectors(point, cell.corners[(index + 1) % cell.corners.length]).normalize(),
  ));
  const minimumZ = Math.min(...cells.flatMap(cell => cell.corners.map(point => point.z)));
  const fillPositions = [];
  for (const cell of cells) {
    for (let index = 0; index < cell.corners.length; index++) {
      for (const point of [cell.center, cell.corners[index], cell.corners[(index + 1) % cell.corners.length]]) {
        fillPositions.push(point.x * SHIELD_RADIUS, point.y * SHIELD_RADIUS, point.z * SHIELD_RADIUS);
      }
    }
  }
  const edgePositions = [];
  for (const edge of topology.edges) {
    if (!edge.cells.some(index => selected.has(index))) continue;
    for (const point of [edge.a, edge.b]) edgePositions.push(point.x * SHIELD_RADIUS, point.y * SHIELD_RADIUS, point.z * SHIELD_RADIUS);
  }
  const fillGeometry = new THREE.BufferGeometry();
  fillGeometry.setAttribute('position', new THREE.Float32BufferAttribute(fillPositions, 3));
  const edgeGeometry = new THREE.BufferGeometry();
  edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
  const opacityScale = { value: 1 };
  const makeMaterial = (isEdge, age) => new THREE.ShaderMaterial({
    uniforms: { age, opacityScale },
    vertexShader: `
      varying vec3 vPosition;
      void main() {
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPosition;
      uniform float age;
      uniform float opacityScale;
      void main() {
        float angle = acos(clamp(normalize(vPosition).z, -1.0, 1.0));
        float localAge = age - angle * ${REVEAL_RATE};
        float appear = smoothstep(0.0, 0.22, localAge);
        if (appear < 0.001) discard;
        float ignition = 1.0 - smoothstep(0.15, 0.85, localAge);
        vec3 gold = mix(vec3(1.0, 0.51, 0.055), vec3(1.0, 0.82, 0.38), ignition * 0.6);
        float alpha = ${isEdge ? '(0.48 + ignition * 0.2)' : '(0.024 + ignition * 0.025)'} * appear * opacityScale;
        gl_FragColor = vec4(gold, alpha);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
  });
  const root = new THREE.Group();
  root.name = 'orbital-gold-shield';
  root.visible = false;
  system.add(root);
  const satellites = [];
  const counts = new Uint8Array(SHIELD_ORBITS.length);
  const formations = new Array(SHIELD_ORBITS.length).fill(null);

  const satelliteGeometry = new THREE.BufferGeometry();
  const satellitePositions = new THREE.Float32BufferAttribute(new Float32Array(MAX_SATELLITES * 3), 3);
  satellitePositions.setUsage(THREE.DynamicDrawUsage);
  satelliteGeometry.setAttribute('position', satellitePositions);
  satelliteGeometry.setDrawRange(0, 0);
  satelliteGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SATELLITE_RADIUS);
  const pointMaterial = new THREE.ShaderMaterial({
    uniforms: { pixelRatio: { value: renderer.getPixelRatio() } },
    vertexShader: `
      uniform float pixelRatio;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 22.0 * pixelRatio;
      }
    `,
    fragmentShader: `
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float halo = exp(-d * d * 10.0) * 0.48;
        float core = 1.0 - smoothstep(0.025, 0.16, d);
        gl_FragColor = vec4(mix(vec3(1.0, 0.56, 0.12), vec3(1.0, 0.91, 0.63), core), halo + core);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
  });
  const dots = new THREE.Points(satelliteGeometry, pointMaterial);
  dots.name = 'gold-orbiting-satellites';
  root.add(dots);
  const radial = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const pose = new THREE.Matrix4();
  const localDirection = new THREE.Vector3();
  const collisionDelta = new THREE.Vector3();
  const collisionPoint = new THREE.Vector3();

  function getState() {
    return { count: satellites.length, maxCount: MAX_SATELLITES, capacityReached: satellites.length === MAX_SATELLITES };
  }

  function basisAt(satellite, nowSeconds) {
    const phase = (nowSeconds - satellite.deployedAt) * SATELLITE_SPEED;
    radial.copy(satellite.origin).multiplyScalar(Math.cos(phase)).addScaledVector(satellite.tangent, Math.sin(phase));
    tangent.crossVectors(satellite.normal, radial).normalize();
  }

  function update(nowSeconds, staticFrame = false) {
    pointMaterial.uniforms.pixelRatio.value = renderer.getPixelRatio();
    for (let index = 0; index < satellites.length; index++) {
      const satellite = satellites[index];
      if (staticFrame) satellite.revealAt = Math.min(satellite.revealAt, nowSeconds - 1.2);
      satellite.age.value = nowSeconds - satellite.revealAt;
      basisAt(satellite, nowSeconds);
      // The same basis positions the dot and every vertex of its patch.
      pose.makeBasis(tangent, satellite.normal, radial);
      satellite.patch.quaternion.setFromRotationMatrix(pose);
      satellitePositions.setXYZ(index, radial.x * SATELLITE_RADIUS, radial.y * SATELLITE_RADIUS, radial.z * SATELLITE_RADIUS);
    }
    if (satellites.length) satellitePositions.needsUpdate = true;
  }

  function deploy(direction, nowSeconds, staticFrame = false) {
    const state = getState();
    if (state.capacityReached || !direction || !Number.isFinite(direction.x + direction.y + direction.z) || direction.lengthSq() < 1e-12) return { ...state, added: false };
    const orbit = chooseShieldOrbit(direction.clone().normalize(), counts);
    if (!orbit) return { ...state, added: false };
    let formation = formations[orbit.index];
    if (!formation) {
      formation = { origin: orbit.origin.clone(), tangent: new THREE.Vector3().crossVectors(orbit.normal, orbit.origin).normalize(), epoch: nowSeconds, occupied: new Set() };
      formations[orbit.index] = formation;
    }
    // Space repeated deployments around the same allowed orbit. This avoids
    // stacking several gold dots and identical patches at the clicked point.
    let bestSlot = -1, bestAlignment = -Infinity;
    const origin = new THREE.Vector3();
    for (let slot = 0; slot < SATELLITES_PER_ORBIT; slot++) {
      if (formation.occupied.has(slot)) continue;
      const phase = (nowSeconds - formation.epoch) * SATELLITE_SPEED + slot * Math.PI * 2 / SATELLITES_PER_ORBIT;
      radial.copy(formation.origin).multiplyScalar(Math.cos(phase)).addScaledVector(formation.tangent, Math.sin(phase));
      const alignment = radial.dot(orbit.origin);
      if (alignment > bestAlignment) { bestAlignment = alignment; bestSlot = slot; origin.copy(radial); }
    }
    formation.occupied.add(bestSlot);
    counts[orbit.index]++;
    const age = { value: 0 };
    const patch = new THREE.Group();
    patch.name = 'gold-satellite-mesh';
    const fill = new THREE.Mesh(fillGeometry, makeMaterial(false, age));
    fill.name = 'gold-honeycomb-fill';
    const lines = new THREE.LineSegments(edgeGeometry, makeMaterial(true, age));
    lines.name = 'gold-honeycomb-edges';
    patch.add(fill, lines);
    root.add(patch);
    satellites.push({ origin, normal: orbit.normal, tangent: new THREE.Vector3().crossVectors(orbit.normal, origin).normalize(), deployedAt: nowSeconds, revealAt: nowSeconds, age, patch });
    opacityScale.value = 1 / Math.sqrt(1 + Math.max(0, satellites.length - 1) * 0.12);
    satelliteGeometry.setDrawRange(0, satellites.length);
    root.visible = true;
    update(nowSeconds, staticFrame);
    return { ...getState(), added: true };
  }

  function activeAt(point, nowSeconds) {
    const radius = point.length();
    if (radius < 1e-9) return false;
    for (const satellite of satellites) {
      if (nowSeconds < satellite.deployedAt) continue;
      basisAt(satellite, nowSeconds);
      localDirection.set(point.dot(tangent), point.dot(satellite.normal), point.dot(radial)).divideScalar(radius);
      if (localDirection.z < minimumZ - 1e-8) continue;
      const angle = Math.acos(THREE.MathUtils.clamp(localDirection.z, -1, 1));
      if (nowSeconds - satellite.revealAt - angle * REVEAL_RATE < 0.08) continue;
      for (let cell = 0; cell < cells.length; cell++) {
        if (cells[cell].center.dot(localDirection) < 0.99) continue;
        if (boundaries[cell].every(edge => edge.dot(localDirection) >= -1e-8)) return true;
      }
    }
    return false;
  }

  function intersectSegment(from, to, nowSeconds, hitPoint, previousSeconds = nowSeconds) {
    if (!satellites.length) return false;
    const duration = Math.max(0, nowSeconds - previousSeconds);
    collisionDelta.subVectors(to, from);
    const a = collisionDelta.lengthSq();
    const b = 2 * from.dot(collisionDelta);
    const cuts = [0, 1];
    // Split at both sides of the thin collision shell, then test the patch's
    // moving position throughout each contact interval, including fast passes.
    if (a > 1e-14) {
      for (const radius of [SHIELD_RADIUS - CONTACT_TOLERANCE, SHIELD_RADIUS, SHIELD_RADIUS + CONTACT_TOLERANCE]) {
        const c = from.lengthSq() - radius * radius;
        const discriminant = b * b - 4 * a * c;
        if (discriminant < 0) continue;
        const root = Math.sqrt(discriminant);
        for (const t of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) if (t > 0 && t < 1) cuts.push(t);
      }
    }
    cuts.sort((x, y) => x - y);
    const relativeTravel = Math.sqrt(a) + duration * SATELLITE_SPEED * SHIELD_RADIUS;
    for (let interval = 0; interval < cuts.length - 1; interval++) {
      const start = cuts[interval], end = cuts[interval + 1];
      collisionPoint.copy(from).addScaledVector(collisionDelta, (start + end) / 2);
      if (Math.abs(collisionPoint.length() - SHIELD_RADIUS) > CONTACT_TOLERANCE + 1e-8) continue;
      const steps = Math.max(1, Math.min(256, Math.ceil(relativeTravel * (end - start) / 0.012)));
      for (let step = 0; step <= steps; step++) {
        const t = start + (end - start) * step / steps;
        collisionPoint.copy(from).addScaledVector(collisionDelta, t);
        if (activeAt(collisionPoint, previousSeconds + duration * t)) {
          hitPoint.copy(collisionPoint).setLength(SHIELD_RADIUS);
          return true;
        }
      }
    }
    return false;
  }

  function reset() {
    for (const satellite of satellites) {
      for (const child of satellite.patch.children) child.material.dispose();
      root.remove(satellite.patch);
    }
    satellites.length = 0;
    counts.fill(0);
    formations.fill(null);
    satelliteGeometry.setDrawRange(0, 0);
    root.visible = false;
  }

  return { deploy, update, reset, getState, intersectSegment };
}
