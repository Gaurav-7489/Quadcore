// Camera Service - Stream, capture, and convert to base64

class CameraService {
  constructor() {
    this.stream = null;
    this.videoElement = null;
    this.facingMode = 'environment'; // rear camera by default
    this.flashlightOn = false;
  }

  async startCamera(videoElement) {
    this.videoElement = videoElement;

    try {
      // Stop any existing stream
      this.stopCamera();

      const constraints = {
        video: {
          facingMode: this.facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.videoElement) {
        this.videoElement.srcObject = this.stream;
        await this.videoElement.play();
      }
      return true;
    } catch (err) {
      console.error('[Camera] Error:', err);
      return false;
    }
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
    this.flashlightOn = false;
  }

  switchCamera() {
    this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
    if (this.videoElement) {
      return this.startCamera(this.videoElement);
    }
  }

  captureFrame(quality = 0.8) {
    if (!this.videoElement || !this.stream) {
      console.warn('[Camera] No active camera');
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = this.videoElement.videoWidth || 640;
    canvas.height = this.videoElement.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);

    // Return base64 JPEG
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    return dataUrl;
  }

  captureFrameBlob(quality = 0.8) {
    return new Promise((resolve) => {
      if (!this.videoElement || !this.stream) {
        resolve(null);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = this.videoElement.videoWidth || 640;
      canvas.height = this.videoElement.videoHeight || 480;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/jpeg', quality);
    });
  }

  isActive() {
    return this.stream !== null && this.stream.active;
  }

  async toggleFlashlight() {
    if (!this.stream) return false;
    const track = this.stream.getVideoTracks()[0];
    if (!track) return false;

    try {
      // Just attempt to apply the constraint directly.
      // Many mobile browsers support torch but do NOT advertise it in getCapabilities()
      this.flashlightOn = !this.flashlightOn;
      await track.applyConstraints({
        advanced: [{ torch: this.flashlightOn }]
      });
      return true;
    } catch (err) {
      console.warn('[Camera] Torch not supported or error:', err);
      // Revert state if the hardware rejected it
      this.flashlightOn = !this.flashlightOn;
      return false;
    }
  }

  checkTorchSupport() {
    if (!this.stream) return false;
    const track = this.stream.getVideoTracks()[0];
    if (!track) return false;

    // Check if the browser formally advertises torch support
    if (typeof track.getCapabilities === 'function') {
      const caps = track.getCapabilities();
      if ('torch' in caps) return true;
    }

    // Fallback: If it's a mobile device, assume it might have a torch (due to buggy browsers)
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    return isMobile;
  }
}

const cameraService = new CameraService();
export default cameraService;
