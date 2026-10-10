import { Vector2, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * Optional bloom post-processing (GDD §9.2 "Bloom configurável").
 * Makes emissive neon glow; can be disabled for performance.
 */
export class PostFX {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly renderPass: RenderPass;

  constructor(private readonly renderer: WebGLRenderer, scene: Scene, camera: Camera) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    // High threshold: only genuinely bright neon glows, so the road and car stay readable.
    this.bloom = new UnrealBloomPass(new Vector2(256, 256), 0.6, 0.4, 0.78);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(width: number, height: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
  }

  /** Bloom strength (0 disables the glow while keeping the pipeline). */
  setStrength(strength: number): void {
    this.bloom.strength = strength;
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  dispose(): void {
    this.bloom.dispose();
    this.composer.dispose();
  }
}
