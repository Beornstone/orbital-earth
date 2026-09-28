import * as THREE from 'three';

export const SHIELD_RADIUS = 1.078;
export const PATCH_ANGLE = 50 * Math.PI / 180;
export const SATELLITES_PER_ORBIT = 4;
export const SHIELD_ORBITS = [
  { id: 'equatorial', normal: new THREE.Vector3(0, 1, 0) },
  { id: 'polar', normal: new THREE.Vector3(1, 0, 0) },
  { id: 'diagonal-east', normal: new THREE.Vector3(1, 1, 0).normalize() },
  { id: 'diagonal-west', normal: new THREE.Vector3(-1, 1, 0).normalize() },
].map(orbit => ({ ...orbit, normal: orbit.normal.applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.42) }));

// The dual of a triangulated icosphere is a closed honeycomb: six sides per
// cell, except for the twelve pentagons needed to close a spherical surface.
export function createShieldTopology(detail = 11) {
  const source = new THREE.IcosahedronGeometry(1, detail);
  const position = source.getAttribute('position');
  const vertices = [];
  const lookup = new Map();
  const faceCenters = [];
  for (let offset = 0; offset < position.count; offset += 3) {
    const face = [];
    for (let corner = 0; corner < 3; corner++) {
      const point = new THREE.Vector3().fromBufferAttribute(position, offset + corner).normalize();
      const key = [point.x, point.y, point.z].map((n) => Math.round(n * 1e6)).join(',');
      let index = lookup.get(key);
      if (index === undefined) {
        index = vertices.length;
        lookup.set(key, index);
        vertices.push({ center: point, faces: [] });
      }
      face.push(index);
      vertices[index].faces.push(faceCenters.length);
    }
    faceCenters.push(face.reduce((sum, index) => sum.add(vertices[index].center), new THREE.Vector3()).normalize());
  }
  source.dispose();

  const edges = [];
  const edgeLookup = new Map();
  let totalArea = 0;
  const cells = vertices.map(({ center, faces }, cellIndex) => {
    const reference = Math.abs(center.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const tangent = new THREE.Vector3().crossVectors(reference, center).normalize();
    const bitangent = new THREE.Vector3().crossVectors(center, tangent);
    faces.sort((a, b) => {
      const angleA = Math.atan2(faceCenters[a].dot(bitangent), faceCenters[a].dot(tangent));
      const angleB = Math.atan2(faceCenters[b].dot(bitangent), faceCenters[b].dot(tangent));
      return angleA - angleB;
    });
    let area = 0;
    const corners = faces.map((index) => faceCenters[index]);
    for (let i = 0; i < faces.length; i++) {
      const a = faces[i];
      const b = faces[(i + 1) % faces.length];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      let edge = edgeLookup.get(key);
      if (!edge) {
        edge = { a: faceCenters[a], b: faceCenters[b], cells: [] };
        edgeLookup.set(key, edge);
        edges.push(edge);
      }
      edge.cells.push(cellIndex);
      const ca = faceCenters[a];
      const cb = faceCenters[b];
      area += 2 * Math.atan2(
        Math.abs(center.dot(new THREE.Vector3().crossVectors(ca, cb))),
        1 + center.dot(ca) + ca.dot(cb) + cb.dot(center),
      );
    }
    totalArea += area;
    return { center, corners, area };
  });
  return { cells, edges, totalArea };
}

// Placement stays on the four permitted planes, with four spaced slots each.
export function chooseShieldOrbit(direction, counts) {
  let best = null;
  for (let index = 0; index < SHIELD_ORBITS.length; index++) {
    if (counts[index] >= SATELLITES_PER_ORBIT) continue;
    const { id, normal } = SHIELD_ORBITS[index];
    const distance = Math.abs(normal.dot(direction));
    if (!best || distance < best.distance - 1e-6 || (Math.abs(distance - best.distance) < 1e-6 && counts[index] < counts[best.index])) {
      const origin = direction.clone().addScaledVector(normal, -normal.dot(direction));
      if (origin.lengthSq() < 1e-12) origin.crossVectors(normal, new THREE.Vector3(0, 0, 1));
      best = { id, index, normal, origin: origin.normalize(), distance };
    }
  }
  return best;
}
