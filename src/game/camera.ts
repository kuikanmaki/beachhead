import { H, W } from "./engine";

export type Camera = { zoom: number; x: number; y: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export const resetCamera = (): Camera => ({ zoom: 1, x: 0, y: 0 });

export function clampCamera(camera: Camera): Camera {
  const zoom = clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM);
  return {
    zoom,
    x: clamp(camera.x, 0, Math.max(0, W - W / zoom)),
    y: clamp(camera.y, 0, Math.max(0, H - H / zoom)),
  };
}

/** Convert a point in the canvas (0–1 on each axis) to map coordinates. */
export function screenToWorld(camera: Camera, u: number, v: number) {
  return { x: camera.x + (u * W) / camera.zoom, y: camera.y + (v * H) / camera.zoom };
}

/** Zoom while keeping the map point at (u, v) stationary on screen. */
export function zoomCamera(camera: Camera, requestedZoom: number, u = 0.5, v = 0.5): Camera {
  const zoom = clamp(requestedZoom, MIN_ZOOM, MAX_ZOOM);
  const anchor = screenToWorld(camera, u, v);
  return clampCamera({ zoom, x: anchor.x - (u * W) / zoom, y: anchor.y - (v * H) / zoom });
}

/** Pan (grab-and-drag): moving the pointer by (dx, dy) world units slides the view the opposite way. */
export function panCamera(camera: Camera, dx: number, dy: number): Camera {
  return clampCamera({ ...camera, x: camera.x - dx, y: camera.y - dy });
}

/** Normalize mouse-wheel and trackpad deltas, including browser line/page modes. */
export function wheelZoom(camera: Camera, deltaY: number, deltaMode: number, u: number, v: number): Camera {
  const dy = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1);
  return zoomCamera(camera, camera.zoom * Math.exp(-dy * 0.0015), u, v);
}
