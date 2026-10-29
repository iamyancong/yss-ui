/**
 * Excel 解析 Worker：读取文件、生成 x-spreadsheet 数据，分段传回（见 ./build-runner.ts）。
 * 切换文件 / 关闭时主线程直接 terminate，不用等解析结束。
 */
import { createTextMeasure, runBuild, type BuildMessage, type BuildRequest } from './build-runner';

const scope = self as unknown as {
  postMessage(message: BuildMessage): void;
  onmessage: ((event: MessageEvent<BuildRequest>) => void) | null;
};

scope.onmessage = event => {
  const post = (message: BuildMessage) => scope.postMessage(message);
  runBuild(event.data, post, { measure: createTextMeasure(), slim: true }).catch((err: unknown) =>
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  );
};
