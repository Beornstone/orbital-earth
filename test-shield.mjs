import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: new URL('./dist/vendor/three.module.js', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const THREE = await import('three');
const { SHIELD_ORBITS, SHIELD_RADIUS } = await import('./dist/shield-geometry.js');
const { createOrbitalShield, SATELLITE_SPEED } = await import('./dist/shield.js');
const { createHostileSatellites, HOSTILE_COUNT } = await import('./dist/hostiles.js');
const renderer = { getPixelRatio: () => 1 };
const system = new THREE.Group();
const shield = createOrbitalShield(system, renderer);
assert.deepEqual(shield.getState(), { count: 0, maxCount: 16, capacityReached: false });
assert.equal(shield.deploy(new THREE.Vector3(), 0).added, false);
assert.equal(shield.deploy(new THREE.Vector3(NaN, 0, 1), 0).added, false);
const direction = new THREE.Vector3(0, 0, 1);
shield.deploy(direction, 0);
const root = system.getObjectByName('orbital-gold-shield');
const dots = system.getObjectByName('gold-orbiting-satellites');
const patch = system.getObjectByName('gold-satellite-mesh');
const fill = patch.getObjectByName('gold-honeycomb-fill');
const lines = patch.getObjectByName('gold-honeycomb-edges');
assert(fill.geometry.getAttribute('position').count > 2000, 'broad cap contains many actual honeycomb cells');
assert(lines.material.depthTest && !lines.material.depthWrite);
const patchStart = patch.quaternion.clone();
const hit = new THREE.Vector3();
const crossing = (d, time, previous = time) => shield.intersectSegment(d.clone().multiplyScalar(1.2), d.clone().multiplyScalar(1.01), time, hit, previous);
assert.equal(crossing(direction, 0), false, 'unrevealed mesh cannot intercept');
assert.equal(crossing(direction, 1), true, 'revealed patch intercepts near its center');
assert.equal(crossing(direction.clone().negate(), 1), false, 'no stationary complete orbital band');
assert.equal(shield.intersectSegment(new THREE.Vector3(0, 0, 1.5), new THREE.Vector3(0, 0, 1.4), 1, hit), false, 'screen overlap at another altitude is not contact');

const halfOrbit = Math.PI / SATELLITE_SPEED;
shield.update(halfOrbit);
const center = new THREE.Vector3(0, 0, 1).applyQuaternion(patch.quaternion);
const dotDirection = new THREE.Vector3().fromBufferAttribute(dots.geometry.getAttribute('position'), 0).normalize();
assert(center.distanceTo(dotDirection) < 1e-7, 'gold satellite remains exactly at mesh center');
assert(patchStart.angleTo(patch.quaternion) > 3, 'the mesh itself rotates around Earth');
assert.equal(crossing(direction, halfOrbit), false, 'previous patch location is no longer protected');
assert.equal(crossing(direction.clone().negate(), halfOrbit), true, 'protection follows the moved mesh');
assert(Math.abs(hit.length() - SHIELD_RADIUS) < 1e-8);
const stationary = direction.clone().multiplyScalar(SHIELD_RADIUS);
assert.equal(shield.intersectSegment(stationary, stationary, halfOrbit * 2 + 4, hit, halfOrbit * 2 - 4), true, 'moving mesh sweeps over a stationary point between frames');
assert.equal(shield.intersectSegment(stationary, stationary, halfOrbit + 1, hit, halfOrbit - 1), false, 'a distant moving patch does not intercept');

// Collision coordinates use the same canonical cells and rigid transform as rendering.
for (const time of [2, 8, 15, 24]) {
  shield.update(time);
  const vertex = fill.geometry.getAttribute('position');
  for (let index = 0; index < vertex.count; index += 90) {
    const p = new THREE.Vector3().fromBufferAttribute(vertex, index).normalize().applyQuaternion(patch.quaternion);
    assert(crossing(p, time), 'rendered cell centers are protected at their current position');
  }
}
for (let index = 1; index < 16; index++) assert(shield.deploy(direction, 25, true).added);
assert.equal(shield.getState().capacityReached, true);
assert.equal(shield.deploy(direction, 25, true).added, false);
assert.equal(root.children.filter(child => child.name === 'gold-satellite-mesh').length, 16);
const geometries = new Set(root.children.filter(child => child.name === 'gold-satellite-mesh').map(child => child.children[0].geometry));
assert.equal(geometries.size, 1, 'patches share one reusable geometry');
for (const time of [25, 30, 45]) {
  shield.update(time);
  const patches = root.children.filter(child => child.name === 'gold-satellite-mesh');
  const positions = dots.geometry.getAttribute('position');
  for (let index = 0; index < 16; index++) {
    const p = new THREE.Vector3().fromBufferAttribute(positions, index).normalize();
    const c = new THREE.Vector3(0, 0, 1).applyQuaternion(patches[index].quaternion);
    assert(c.distanceTo(p) < 1e-6);
    assert(SHIELD_ORBITS.some(orbit => Math.abs(orbit.normal.dot(p)) < 1e-6), 'all satellites stay on allowed planes');
  }
}

const hostiles = createHostileSatellites(system, renderer, shield);
hostiles.reset(45);
let sawFlash = false, sawBrightness = false, previousDestroyed = 0;
const hostileGeometry = system.getObjectByName('red-hostile-satellites').geometry;
for (let time = 45; time < 115; time += 0.025) {
  shield.update(time);
  hostiles.update(time);
  const state = hostiles.getState();
  sawFlash ||= state.flashing > 0;
  sawBrightness ||= [...hostileGeometry.getAttribute('flare').array].some(value => value > 0.8);
  assert(state.destroyed >= previousDestroyed);
  assert.equal(state.active + state.flashing + state.destroyed, HOSTILE_COUNT);
  previousDestroyed = state.destroyed;
}
assert(sawFlash && sawBrightness, 'red collisions brighten and evaporate');
assert.equal(hostiles.getState().destroyed, 48, 'a populated moving constellation intercepts crossing hostiles');
shield.reset();
hostiles.reset(115);
assert.deepEqual(shield.getState(), { count: 0, maxCount: 16, capacityReached: false });
assert.equal(root.children.length, 1, 'reset removes moving patches without retaining objects');
assert.equal(root.visible, false);
assert.deepEqual(hostiles.getState(), { active: 48, flashing: 0, destroyed: 0, total: 48 });
for (let time = 115; time < 150; time += 0.1) hostiles.update(time);
assert.equal(hostiles.getState().destroyed, 0, 'former mesh positions have no leftover protection');
shield.deploy(direction, 150, true);
assert(crossing(direction, 150), 'static deployment settles immediately');
shield.update(150, true);
const staticPose = root.getObjectByName('gold-satellite-mesh').quaternion.clone();
shield.update(150, true);
assert(staticPose.equals(root.getObjectByName('gold-satellite-mesh').quaternion), 'paused patch and dot stay still together');
console.log('Moving mesh, centered satellites, four orbit planes, swept collisions, flashes, reset, and static rendering: passed.');
