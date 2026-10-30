/*
 * Rendering pipeline: physically based lighting, physical sky, HDR image-based
 * lighting (reflections in glass & paint), soft sun shadows, filmic tone mapping
 * and post-processing (ambient occlusion, bloom, SMAA).
 * Quality presets trade effects for frame rate; "auto" adapts at runtime.
 */
(function (PD) {
  'use strict';
  const A = THREE.addons;

  const PRESETS = {
    low: { pr: 0.85, shadow: 1024, ao: false, bloom: false, smaa: true, aa: false, shadowSoft: false },
    medium: { pr: 1.0, shadow: 2048, ao: false, bloom: true, smaa: true, aa: false, shadowSoft: true },
    high: { pr: 1.0, shadow: 4096, ao: true, bloom: true, smaa: true, aa: false, shadowSoft: true },
    ultra: { pr: 1.5, shadow: 4096, ao: true, bloom: true, smaa: true, aa: false, shadowSoft: true },
  };
  const ORDER = ['low', 'medium', 'high', 'ultra'];

  const Gfx = {
    quality: 'high',
    auto: true,
    init(canvas) {
      const saved = PD.Input.settings.quality || 'auto';
      this.auto = saved === 'auto';
      this.quality = this.auto ? 'high' : saved;
      this.canvas = canvas;
      this.createRenderer(PRESETS[this.quality].aa);

      const scene = this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1800);

      // physical sky
      const sky = new A.Sky();
      sky.scale.setScalar(4500);
      const u = sky.material.uniforms;
      u.turbidity.value = 3.2; u.rayleigh.value = 2.2; u.mieCoefficient.value = 0.003; u.mieDirectionalG.value = 0.8;
      const elev = THREE.MathUtils.degToRad(32), azim = THREE.MathUtils.degToRad(140);
      this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elev, azim);
      u.sunPosition.value.copy(this.sunDir);
      scene.add(sky);
      this.sky = sky;
      scene.fog = new THREE.FogExp2(0xa9bccd, 0.0011);

      // sun + sky fill
      const sun = this.sun = new THREE.DirectionalLight(0xfff1dc, 4.2);
      sun.castShadow = true;
      const sc = sun.shadow.camera;
      sc.left = -85; sc.right = 85; sc.top = 85; sc.bottom = -85; sc.near = 1; sc.far = 500;
      sun.shadow.bias = -0.0003;
      sun.shadow.normalBias = 0.035;
      scene.add(sun, sun.target);
      scene.add(new THREE.HemisphereLight(0xbcd4ec, 0x5b5348, 0.5));

      this.loadEnvironment();
      this.applyQuality();
      window.addEventListener('resize', () => this.resize());
      return this;
    },

    createRenderer(aa) {
      if (this.renderer) this.renderer.dispose();
      const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: aa, powerPreference: 'high-performance', stencil: false });
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      r.toneMappingExposure = 0.72;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      r.setSize(window.innerWidth, window.innerHeight);
      PD.maxAniso = r.capabilities.getMaxAnisotropy();
    },

    // CC0 city HDRI -> prefiltered environment map (reflections + ambient light).
    loadEnvironment() {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      new A.EXRLoader().load(window.PD_ASSETS.cityExr, (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        const env = pmrem.fromEquirectangular(tex).texture;
        this.scene.environment = env;
        tex.dispose(); pmrem.dispose();
        this.scene.traverse((o) => {
          if (o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity = o.material.metalness > 0.5 ? 1.25 : 0.75;
        });
      }, undefined, (e) => console.warn('HDRI failed to load', e));
    },

    applyQuality() {
      const p = PRESETS[this.quality];
      const r = this.renderer;
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pr));
      r.shadowMap.type = p.shadowSoft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
      this.sun.shadow.mapSize.set(p.shadow, p.shadow);
      this.sun.shadow.radius = 2;

      const w = window.innerWidth, h = window.innerHeight;
      const comp = this.composer = new A.EffectComposer(r);
      comp.setPixelRatio(r.getPixelRatio());
      comp.setSize(w, h);
      comp.addPass(new A.RenderPass(this.scene, this.camera));
      this.ao = null;
      if (p.ao) {
        const ao = new A.GTAOPass(this.scene, this.camera, w, h);
        ao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.6, thickness: 2.0, scale: 1.0, samples: 12 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
        ao.blendIntensity = 0.9;
        comp.addPass(ao);
        this.ao = ao;
      }
      if (p.bloom) comp.addPass(new A.UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.5, 0.9));
      comp.addPass(new A.OutputPass());
      if (p.smaa) comp.addPass(new A.SMAAPass(w * r.getPixelRatio(), h * r.getPixelRatio()));
      this.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    },

    setQuality(q) {
      this.auto = q === 'auto';
      PD.Input.settings.quality = q; PD.Input.saveSettings();
      if (this.auto) q = 'high';
      this.quality = q;
      this.applyQuality();
      this.fpsT = 0; this.fpsN = 0; this.downgrades = 0;
    },

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      if (this.composer) this.composer.setSize(w, h);
    },

    // keep the shadow frustum centred on the action
    follow(focus) {
      const s = this.sun;
      s.position.set(focus.x + this.sunDir.x * 160, this.sunDir.y * 160, focus.z + this.sunDir.z * 160);
      // snap to shadow texels to avoid shimmering
      const texel = 170 / s.shadow.mapSize.x;
      s.position.x = Math.round(s.position.x / texel) * texel;
      s.position.z = Math.round(s.position.z / texel) * texel;
      s.target.position.set(s.position.x - this.sunDir.x * 160, 0, s.position.z - this.sunDir.z * 160);
      s.target.updateMatrixWorld();
    },

    fpsT: 0, fpsN: 0, downgrades: 0,
    render(dt) {
      this.composer.render(dt);
      // adaptive quality: step down while the game runs under ~40 fps
      if (!this.auto || this.downgrades >= 2) return;
      this.fpsT += dt; this.fpsN++;
      if (this.fpsT > 4) {
        const fps = this.fpsN / this.fpsT;
        this.fpsT = 0; this.fpsN = 0;
        const i = ORDER.indexOf(this.quality);
        if (fps < 40 && i > 0) {
          this.quality = ORDER[i - 1];
          this.downgrades++;
          this.applyQuality();
          PD.UI && PD.UI.toast('Graphics auto-adjusted to ' + this.quality.toUpperCase() + ' (' + Math.round(fps) + ' fps)', 'info');
        }
      }
    },
  };

  PD.Graphics = Gfx;
})(window.PD);
