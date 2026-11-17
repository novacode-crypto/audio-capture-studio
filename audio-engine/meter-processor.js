// AudioWorklet: mide RMS, pico y min/max por bloque directamente sobre las muestras.
// El reloj de audio (currentFrame) hace que la deteccion no dependa de temporizadores
// de la pagina ni de su throttling en segundo plano.
class MeterProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.block = (options.processorOptions && options.processorOptions.block) || 1024;
    this.resetAcc();
  }

  resetAcc() {
    this.n = 0;
    this.ss0 = 0;
    this.ss1 = 0;
    this.peak = 0;
    this.min = 0;
    this.max = 0;
  }

  process(inputs) {
    const input = inputs[0];
    let len = 128;
    if (input && input.length > 0) {
      len = input[0].length;
      for (let c = 0; c < input.length; c++) {
        const d = input[c];
        let s = 0;
        for (let i = 0; i < len; i++) {
          const v = d[i];
          s += v * v;
          const a = v < 0 ? -v : v;
          if (a > this.peak) this.peak = a;
          if (v < this.min) this.min = v;
          if (v > this.max) this.max = v;
        }
        if (c === 0) this.ss0 += s;
        else if (c === 1) this.ss1 += s;
      }
      if (input.length === 1) this.ss1 = this.ss0;
    }
    this.n += len;
    if (this.n >= this.block) {
      const rms = Math.sqrt(Math.max(this.ss0, this.ss1) / this.n);
      this.port.postMessage({
        rms,
        peak: this.peak,
        min: this.min,
        max: this.max,
        n: this.n,
        frame: currentFrame + len,
        sampleRate,
      });
      this.resetAcc();
    }
    return true;
  }
}

registerProcessor('meter-processor', MeterProcessor);
