/**
 * Riff Chimera's way into CHIMERA, bundled with it by .github/scripts/build-chimera.sh into
 * plugins/riff-chimera/assets/chimera/chimera.js: the engine on the main thread (its JSON call, and
 * the compiled module the AudioWorklet instantiates), and CHIMERA's own cutaway head, drawn from a
 * voice's telemetry as CHIMERA's anatomy view draws it. Everything here is CHIMERA's code; this file
 * only puts it behind two calls. The build copies it into CHIMERA's checkout as riff/entry.ts.
 */
import { initChimera, call, chimeraModule } from "../src/wasm/chimera.ts";
import type { TelemetryMessage } from "../src/worklet/protocol.ts";
import type { BodyMix } from "../src/wasm/types.ts";

/** A head for one voice, drawn on its own canvas. */
export interface Head {
  /** Draws a frame: the voice's latest telemetry (null at rest), seconds since the last frame. */
  draw(tele: TelemetryMessage | null, dt: number): void;
}

/**
 * Loads the engine from `wasm`, then the head (whose modules read the engine's catalogue as they
 * load, so they wait for it).
 */
export async function boot(wasm: string): Promise<{ call: typeof call; module: WebAssembly.Module; head: (canvas: HTMLCanvasElement, body: BodyMix, sampleRate: number, facing: 1 | -1) => Head }> {
  await initChimera(wasm);
  const { AnatomyRenderer } = await import("../src/ui/render/anatomy.ts");
  const { Glow } = await import("../src/ui/render/vector.ts");
  const { VoiceModel } = await import("../src/ui/analysis.ts");
  const { NEUTRAL } = await import("../src/wasm/engine.ts");
  const VIEW = { pressure: true, particles: true, grid: false, calipers: false };
  const head = (canvas: HTMLCanvasElement, body: BodyMix, sampleRate: number, facing: 1 | -1): Head => {
    const r = new AnatomyRenderer();
    const glow = new Glow();
    const model = new VoiceModel(body, sampleRate);
    const ctx = canvas.getContext("2d")!;
    let size = "";
    return {
      draw(tele, dt) {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (!w || !h) return;
        if (size !== `${w}x${h}@${dpr}`) {
          size = `${w}x${h}@${dpr}`;
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          r.resize(w, h);
        }
        const a = tele ? VoiceModel.articFromArray(tele.t.artic) : { ...NEUTRAL };
        r.face.update(tele, dt);
        const f = model.frame(a);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // The second of two heads faces the first, as CHIMERA's duet page stages them.
        ctx.setTransform(dpr * facing, 0, 0, dpr, facing < 0 ? canvas.width : 0, 0);
        r.draw(ctx, model, f, a, tele, VIEW, { hover: null, drag: null, dt, formants: [], slots: [], info: [] });
        glow.apply(canvas, ctx, dpr);
      },
    };
  };
  return { call, module: chimeraModule(), head };
}
