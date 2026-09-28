import * as THREE from 'three';

export function createSpaceBackground(scene, renderer, texture) {
  texture.colorSpace = THREE.NoColorSpace;
  const time = { value: 0 };
  const parallax = { value: new THREE.Vector2() };
  const aspect = { value: 1 };
  const nebula = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: {
        nebulaMap: { value: texture }, time, parallax, aspect,
        imageAspect: { value: texture.image.width / texture.image.height },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.9999, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D nebulaMap;
        uniform float time;
        uniform vec2 parallax;
        uniform float aspect;
        uniform float imageAspect;
        varying vec2 vUv;
        void main() {
          // Rotate the framing on phones, preserving the clouds' proportions.
          bool portrait = aspect < 0.85;
          float viewAspect = portrait ? 1.0 / aspect : aspect;
          vec2 uv = portrait ? vec2(vUv.y, 1.0 - vUv.x) : vUv;
          vec2 cover = viewAspect > imageAspect
            ? vec2(1.0, imageAspect / viewAspect)
            : vec2(viewAspect / imageAspect, 1.0);
          // Overscan keeps texture edges outside the viewport during drift.
          uv = (uv - 0.5) * cover * 0.93 + 0.5;
          uv += vec2(sin(time * 0.025), cos(time * 0.019)) * 0.014;
          uv += vec2(
            sin(vUv.y * 5.0 + time * 0.028),
            cos(vUv.x * 4.0 - time * 0.021)
          ) * 0.004;
          uv += parallax * vec2(0.55, 0.7);
          vec3 clouds = pow(texture2D(nebulaMap, uv).rgb, vec3(2.2));
          // Preserve negative space and keep the planet brighter than its setting.
          vec2 center = (vUv - 0.5) * vec2(min(aspect, 1.8), 1.0);
          float framing = mix(0.55, 1.0, smoothstep(0.12, 0.53, length(center)));
          float breath = 0.96 + 0.04 * sin(time * 0.06);
          vec3 color = vec3(0.0006, 0.0012, 0.0024) + clouds * 0.34 * framing * breath;
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
      depthWrite: false,
      depthTest: false,
    }),
  );
  nebula.frustumCulled = false;
  nebula.renderOrder = -1000;
  scene.add(nebula);

  let seed = 18427;
  function random() {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const positions = [];
  const colors = [];
  const sizes = [];
  const phases = [];
  for (let i = 0; i < 1450; i++) {
    positions.push(random() * 2 - 1, random() * 2 - 1, random());
    const brightness = 0.30 + random() ** 2 * 0.60;
    const warm = random() > 0.85;
    const tint = warm ? [1, 0.83, 0.66] : [0.69, 0.81, 1];
    colors.push(...tint.map(channel => channel * brightness));
    sizes.push(0.75 + random() ** 4 * 2.4);
    phases.push(random() * Math.PI * 2);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
  const stars = new THREE.Points(geometry, new THREE.ShaderMaterial({
    uniforms: { time, parallax, aspect, pixelRatio: { value: renderer.getPixelRatio() } },
    vertexColors: true,
    vertexShader: `
      attribute float size;
      attribute float phase;
      uniform float time;
      uniform float pixelRatio;
      uniform float aspect;
      uniform vec2 parallax;
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        float depth = 0.35 + position.z * 0.65;
        vec2 drift = vec2(time * 0.00013 / max(aspect, 0.5), time * 0.000045) * depth;
        vec2 p = mod(position.xy + drift + parallax * depth * 0.50 + 1.0, 2.0) - 1.0;
        // Far depth makes Earth and foreground satellites occlude the star field.
        gl_Position = vec4(p, 0.9998, 1.0);
        gl_PointSize = max(1.0, size * pixelRatio);
        vColor = color;
        float amplitude = size > 2.0 ? 0.24 : 0.10;
        vTwinkle = 1.0 - amplitude + amplitude * sin(time * (0.35 + depth * 0.40) + phase);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vTwinkle;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float glow = 1.0 - smoothstep(0.0, 1.0, d);
        gl_FragColor = vec4(vColor, glow * vTwinkle * 0.90);
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
  }));
  stars.frustumCulled = false;
  stars.renderOrder = -900;
  scene.add(stars);

  return {
    resize(width, height) {
      aspect.value = width / Math.max(height, 1);
      // Keep a similar star density on phones and large desktop displays.
      geometry.setDrawRange(0, Math.min(1450, Math.max(430, Math.round(width * height / 700))));
    },
    update(elapsed, movement) {
      time.value = elapsed;
      parallax.value.copy(movement);
    },
  };
}
