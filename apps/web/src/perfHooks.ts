/**
 * Inspection handles (`window.__hexfall`, `window.__world3d`) and the 3D stress presets exist
 * in dev builds and in the benchmark's production build (`VITE_PERF=1`, see
 * docs/BROWSER_PERFORMANCE_REPORT.md). In ordinary production builds this is the constant
 * `false`: the handles are dropped and the stress presets are never read.
 */
export const PERF_HOOKS = import.meta.env.DEV || import.meta.env.VITE_PERF === '1';
