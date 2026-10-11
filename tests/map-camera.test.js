import test from "node:test";
import assert from "node:assert/strict";
import { animateMapCamera } from "../src/utils/mapCamera.js";

function fixture() {
  let time = 0, next = 0;
  const pending = new Map(), moves = [];
  const map = {
    center: { lat: -33.88, lng: 151.20 }, zoom: 13,
    getCenter() { return { lat: () => this.center.lat, lng: () => this.center.lng }; },
    getZoom() { return this.zoom; },
    moveCamera(camera) { this.center = camera.center; this.zoom = camera.zoom; moves.push(camera); },
  };
  const clock = {
    now: () => time,
    requestFrame(callback) { pending.set(++next, callback); return next; },
    cancelFrame(id) { pending.delete(id); },
  };
  function tick(milliseconds) {
    time += milliseconds;
    const callbacks = [...pending.values()];
    pending.clear();
    callbacks.forEach(callback => callback(time));
  }
  return { map, clock, pending, moves, tick };
}

const target = { center: { lat: -33.86, lng: 151.22 }, zoom: 16 };

test("map camera eases centre and zoom together, landing exactly on the selected venue", () => {
  const { map, clock, moves, pending, tick } = fixture();
  animateMapCamera(map, target, clock);
  assert.equal(moves.length, 0);
  tick(130);
  assert.ok(map.zoom > 13 && map.zoom < 14);
  assert.ok(map.center.lat > -33.88 && map.center.lat < -33.86);
  tick(195);
  assert.equal(map.zoom, 14.5);
  assert.ok(Math.abs(map.center.lat - -33.87) < 1e-10);
  tick(325);
  assert.deepEqual(moves.at(-1), target);
  assert.equal(pending.size, 0);
});

test("a rapid new selection starts from the current view and cancels stale destination frames", () => {
  const { map, clock, pending, moves, tick } = fixture();
  const cancel = animateMapCamera(map, target, clock);
  tick(325);
  const intermediate = moves.at(-1);
  const staleFrame = [...pending.values()][0];
  cancel();
  const latest = { center: { lat: -33.90, lng: 151.18 }, zoom: 16 };
  animateMapCamera(map, latest, clock);
  tick(0);
  assert.deepEqual(moves.at(-1), intermediate);
  staleFrame(10000);
  assert.deepEqual(moves.at(-1), intermediate);
  tick(650);
  assert.deepEqual(moves.at(-1), latest);
  assert.equal(pending.size, 0);
});

test("cancelling movement for a reset, gesture or unmount leaves the new view alone", () => {
  const { map, clock, pending, moves, tick } = fixture();
  const cancel = animateMapCamera(map, target, clock);
  tick(130);
  const staleFrame = [...pending.values()][0];
  cancel();
  const manual = { center: { lat: -33.85, lng: 151.25 }, zoom: 12 };
  map.moveCamera(manual);
  staleFrame(10000);
  tick(10000);
  assert.deepEqual(moves.at(-1), manual);
  assert.equal(pending.size, 0);
});
