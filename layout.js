// Room geometry shared by the game, the renderer and the art tools.
// Every room painting is 1536 x 1024. The floor is a 12 x 7 grid of squares;
// doorways sit in the back wall above row 0, in one of three arch slots.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LB_LAYOUT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 1536;
  const H = 1024;
  const COLS = 12;
  const ROWS = 7;
  // Floor rectangle as fractions of the painting.
  const FLOOR = { x0: 0.04, y0: 0.22, x1: 0.96, y1: 0.985 };
  // Each arch spans two columns of row 0; heroes leave by standing on either square.
  const ARCHES = { left: [1, 2], center: [5, 6], right: [9, 10] };

  const cellW = ((FLOOR.x1 - FLOOR.x0) * W) / COLS;
  const cellH = ((FLOOR.y1 - FLOOR.y0) * H) / ROWS;

  // Pixel rectangle of a square, in painting coordinates.
  function cellRect(col, row) {
    return { x: FLOOR.x0 * W + col * cellW, y: FLOOR.y0 * H + row * cellH, w: cellW, h: cellH };
  }

  // Where a standing figure's feet go: the middle of the square, a little below center.
  function footPoint(col, row) {
    const r = cellRect(col, row);
    return { x: r.x + r.w / 2, y: r.y + r.h * 0.78 };
  }

  // Horizontal center of an arch, in painting pixels.
  function archCenterX(slot) {
    const [a] = ARCHES[slot];
    return FLOOR.x0 * W + (a + 1) * cellW;
  }

  return { W, H, COLS, ROWS, FLOOR, ARCHES, cellW, cellH, cellRect, footPoint, archCenterX };
});
