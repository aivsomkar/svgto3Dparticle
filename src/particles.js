import * as THREE from "three";
import { vertexShader, fragmentShader } from "./shaders.js";

// Builds (and rebuilds) the THREE.Points object from sampled SVG data.
export class ParticleSystem {
  constructor({ pixelRatio = 1 } = {}) {
    this.uniforms = {
      uIdlePhase: { value: 0 },
      uIdleAmp: { value: 0.12 },
      uIdleFreq: { value: 3.5 },
      uIdleMode: { value: 0 },

      uCursor: { value: new THREE.Vector3(999, 999, 0) },
      uCursorActive: { value: 0 },
      uWaveAmp: { value: 0.35 },
      uWaveFreq: { value: 14.0 },
      uWaveSpeed: { value: 0 },
      uCursorRadius: { value: 0.45 },
      uCursorPush: { value: 0.06 },

      uSize: { value: 6.0 },
      uPixelRatio: { value: pixelRatio },

      uOpacity: { value: 0.95 },
      uFogColor: { value: new THREE.Color(0x05070a) },
      uFogNear: { value: 4.0 },
      uFogFar: { value: 9.0 },
      uUseFog: { value: 1 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
    });

    this.points = new THREE.Points(new THREE.BufferGeometry(), this.material);
    this.points.frustumCulled = false;

    // Invisible plane used for raycasting the cursor onto the shape. It rotates
    // with the points, so the hit can be converted to mesh-local coordinates.
    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide })
    );
    this.points.add(this.pickPlane);
  }

  setData({ positions, colors, rands, extent }) {
    const geo = this.points.geometry;
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geo.setAttribute("aRand", new THREE.BufferAttribute(rands, 1));
    geo.computeBoundingSphere();

    // size the pick plane a bit beyond the shape so edge particles still react
    const pad = 1.5;
    this.pickPlane.scale.set(extent.x * 2 * pad, extent.y * 2 * pad, 1);
  }

  setBlending(additive) {
    this.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.material.needsUpdate = true;
  }

  setUniformColor(hex) {
    // overwrite per-particle colors with a single color
    const geo = this.points.geometry;
    const attr = geo.getAttribute("aColor");
    if (!attr) return;
    const c = new THREE.Color(hex);
    for (let i = 0; i < attr.count; i++) attr.setXYZ(i, c.r, c.g, c.b);
    attr.needsUpdate = true;
  }

  get count() {
    const attr = this.points.geometry.getAttribute("position");
    return attr ? attr.count : 0;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
