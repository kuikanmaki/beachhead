import { beforeEach, describe, expect, it } from "vitest";
import { setMapSize } from "@/game/engine";
import { MAX_ZOOM, MIN_ZOOM, resetCamera, screenToWorld, wheelZoom, zoomCamera } from "@/game/camera";

describe("map camera", () => {
  beforeEach(() => setMapSize(2));

  it("keeps the point under the cursor stationary while zooming", () => {
    const camera = resetCamera();
    const before = screenToWorld(camera, 0.25, 0.75);
    const zoomed = zoomCamera(camera, 2, 0.25, 0.75);
    const after = screenToWorld(zoomed, 0.25, 0.75);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(zoomed.zoom).toBe(2);
  });

  it("limits zoom and keeps the visible area inside the map", () => {
    const maxed = zoomCamera(resetCamera(), 100, 1, 1);
    expect(maxed.zoom).toBe(MAX_ZOOM);
    expect(maxed.x).toBe(64 - 64 / MAX_ZOOM);
    expect(maxed.y).toBe(32 - 32 / MAX_ZOOM);
    expect(zoomCamera(maxed, 0)).toEqual({ zoom: MIN_ZOOM, x: 0, y: 0 });
  });

  it("scales trackpad and mouse input by delta magnitude", () => {
    const camera = resetCamera();
    const small = wheelZoom(camera, -10, 0, 0.5, 0.5);
    const large = wheelZoom(camera, -100, 0, 0.5, 0.5);
    expect(large.zoom).toBeGreaterThan(small.zoom);
    expect(small.zoom).toBeCloseTo(Math.exp(0.015));
    expect(wheelZoom(camera, -10, 1, 0.5, 0.5).zoom).toBeCloseTo(wheelZoom(camera, -160, 0, 0.5, 0.5).zoom);
  });
});
