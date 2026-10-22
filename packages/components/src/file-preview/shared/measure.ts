/**
 * 文字宽度测量（pptx 图表修正与 Excel 图表共用）。
 */
let measureCtx: CanvasRenderingContext2D | null | undefined;

/** 文字宽度（px）。没有 canvas 时按字符估算：中日韩等全角字符 1em，其余 0.55em */
export function measureText(text: string, fontSize: number, fontFamily = 'sans-serif'): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    } catch {
      measureCtx = null;
    }
  }
  if (measureCtx && typeof measureCtx.measureText === 'function') {
    measureCtx.font = `${fontSize}px ${fontFamily}`;
    const w = measureCtx.measureText(text).width;
    if (Number.isFinite(w) && w > 0) return w;
  }
  let units = 0;
  for (const ch of text)
    units += /[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/.test(ch) ? 1 : 0.55;
  return units * fontSize;
}

