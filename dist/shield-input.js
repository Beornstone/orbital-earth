import * as THREE from 'three';

export function attachShieldInteraction({ canvas, camera, system, shield, getTime, isStatic, invalidate, onReset = () => {} }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const surface = new THREE.Sphere(new THREE.Vector3(), 1);
  const intersection = new THREE.Vector3();
  const status = document.querySelector('#shield-status');
  let press = null;

  function pick(clientX, clientY) {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    pointer.set(
      (clientX - bounds.left) / bounds.width * 2 - 1,
      1 - (clientY - bounds.top) / bounds.height * 2,
    );
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectSphere(surface, intersection)) return null;
    system.updateWorldMatrix(true, false);
    return system.worldToLocal(intersection.clone()).normalize();
  }

  function announce() {
    const state = shield.getState();
    canvas.dataset.goldSatellites = String(state.count);
    canvas.dataset.shieldCapacityReached = String(state.capacityReached);
    const satellites = `${state.count} gold ${state.count === 1 ? 'satellite' : 'satellites'} with orbiting mesh shields deployed.`;
    status.textContent = state.capacityReached
      ? `${satellites} All orbital positions filled. Press R to reset.`
      : satellites;
    return state;
  }

  function deploy(direction) {
    if (!direction) return;
    const result = shield.deploy(direction, getTime(), isStatic());
    if (!result.added) return;
    announce();
    invalidate();
  }

  function deployAtCenter() {
    const bounds = canvas.getBoundingClientRect();
    deploy(pick(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2));
  }

  canvas.addEventListener('pointermove', event => {
    if (event.pointerType === 'mouse') {
      canvas.classList.toggle('shield-hover', !!pick(event.clientX, event.clientY));
    }
  }, { passive: true });
  canvas.addEventListener('pointerleave', () => canvas.classList.remove('shield-hover'));

  canvas.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || !pick(event.clientX, event.clientY)) return;
    press = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.focus({ preventScroll: true });
  });
  canvas.addEventListener('pointerup', event => {
    const start = press;
    press = null;
    if (!start || start.id !== event.pointerId || !event.isPrimary) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (distance > (event.pointerType === 'touch' ? 12 : 8)) return;
    deploy(pick(event.clientX, event.clientY));
  });
  canvas.addEventListener('pointercancel', () => { press = null; });

  // Assistive technology can activate the canvas without pointer events.
  canvas.addEventListener('click', event => {
    if (event.detail === 0) deployAtCenter();
  });
  canvas.addEventListener('keydown', event => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'Enter' || event.code === 'NumpadEnter') {
      event.preventDefault();
      deployAtCenter();
    } else if (event.code === 'KeyR') {
      event.preventDefault();
      shield.reset();
      onReset();
      announce();
      invalidate();
    }
  });

  announce();
  return { getState: () => shield.getState() };
}
