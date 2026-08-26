// CPU mirror of the shader's barrel distortion, plus a numerical inverse.
// Keep the constants in lockstep with SCREEN_FRAG in crt.ts.

const K = 0.11;

/** shader curve(): screen uv -> distorted sampling uv */
export function curveUv(u: number, v: number, curv: number): [number, number] {
  let x = u * 2 - 1;
  let y = v * 2 - 1;
  const f = 1 + (x * x + y * y) * curv * K;
  x *= f;
  y *= f;
  return [x * 0.5 + 0.5, y * 0.5 + 0.5];
}

/** fixed-point inverse of curveUv (converges in a few iterations for k<=0.11) */
export function inverseCurveUv(u: number, v: number, curv: number): [number, number] {
  const qx = u * 2 - 1;
  const qy = v * 2 - 1;
  let x = qx;
  let y = qy;
  for (let i = 0; i < 6; i++) {
    const f = 1 + (x * x + y * y) * curv * K;
    x = qx / f;
    y = qy / f;
  }
  return [x * 0.5 + 0.5, y * 0.5 + 0.5];
}

export const contentMargin = (curv: number) => curv * 0.02 + 0.006;

/** screen uv -> content (texture) uv: what the shader samples at that pixel */
export function screenToContent(u: number, v: number, curv: number): [number, number] {
  const [su, sv] = curveUv(u, v, curv);
  const m = contentMargin(curv);
  return [(su - m) / (1 - 2 * m), (sv - m) / (1 - 2 * m)];
}
