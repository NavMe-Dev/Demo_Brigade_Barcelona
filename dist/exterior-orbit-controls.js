import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// OrbitControls also calls update from its input handlers. Accumulate those
// inputs and consume them once, in the exterior render loop.
export class ExteriorOrbitControls extends OrbitControls {
  constructor(camera, canvas) {
    super(camera, canvas);
    this.frameDriven = true;
    // The vendor wheel handler only accepts input between drag gestures.
    // Queue wheel zoom here when a mouse drag already owns the pointer.
    canvas.addEventListener('wheel', this.zoomWhileDragging, { passive: false });
  }

  zoomWhileDragging = event => {
    if (!this.enabled || !this.enableZoom || this.state === -1) return;
    event.preventDefault();
    this._handleMouseWheel(this._customWheelEvent(event));
  };

  dispose() {
    this.domElement.removeEventListener('wheel', this.zoomWhileDragging);
    super.dispose();
  }

  update() {
    if (!this.frameDriven) return super.update();
  }

  advance(seconds) {
    this.dampingFactor = 1 - Math.pow(1 - .07, 60 * seconds);
    const remainingZoom = this._scale;
    this._scale = Math.pow(remainingZoom, 1 - Math.exp(-20 * seconds));
    const appliedZoom = this._scale;
    const changed = super.update(seconds);
    this._scale = Math.abs(Math.log(remainingZoom / appliedZoom)) > .0005
      ? remainingZoom / appliedZoom : 1;
    return changed;
  }

  clearMomentum() {
    this._sphericalDelta.set(0, 0, 0);
    this._panOffset.set(0, 0, 0);
    this._scale = 1;
  }
}
