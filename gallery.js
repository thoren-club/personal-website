let ARTWORKS = window.GALLERY_IMAGES || [];
let pendingArtworks = null;
const vignette = document.querySelector(".vignette");
let camera = 0, cameraMotion = null, previousCameraLog = 0, cameraBlur = 0;
const stage = document.querySelector('#gallery');
const root = document.querySelector('#rings');
const fieldRoot = document.querySelector('#field');
const viewControl = document.querySelector('.view-control');
const viewToggle = document.querySelector('.view-toggle');
let view = 'field';
let layoutMotion = null;
const field = { x: 0, y: 0, targetX: 0, targetY: 0, zoom: .9, baseZoom: 1, zoomAnchor: null, cells: [], columns: 0, rows: 0, width: 400, gapX: 442.5, gapY: 337.5 };
const hint = document.querySelector('#hint');
const announcement = document.querySelector('#announcement');
const viewer = document.querySelector('#viewer');
const expanded = document.querySelector('.expanded-card');
const expandedImage = document.querySelector('.expanded-image');
const shade = document.querySelector('.viewer-shade');
const closeButton = document.querySelector('.close-button');
const title = document.querySelector('#viewer-title');
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const touchQuery = matchMedia('(hover: none)');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const modulo = (v, n) => ((v % n) + n) % n;
const accelerate = value => { const t = clamp(value, 0, 1); return t * t * t * (t * (6 * t - 15) + 10); };
const CONFIG = { radius: 410, size: 160, ratio: 1.65, inner: 14, outer: 3, idle: .022, rotation: 1.15, minimumPixel: .65, introDuration: 7600 };
let reduced = motionQuery.matches;
let scale = 1, manual = 0, drift = 0, progress = 0, spin = 0;
let frame = 0, lastTime = performance.now(), startTime = lastTime;
let skipIntro = reduced, interacted = false, hintShown = false;
let motion = null, manualVelocity = 0, selected = null, closing = false, announceTimer;
let suppressClickUntil = 0, drag = null;

const rings = Array.from({ length: CONFIG.inner + CONFIG.outer + 1 }, () => {
  const node = document.createElement('div');
  node.className = 'ring';
  const ring = { node, cards: [], sequence: null, worldScale: 1, rotation: 0 };
  for (let index = 0; index < 12; index++) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'tile'; button.tabIndex = -1;
    button.dataset.index = index;
    button.style.backgroundSize = 'cover'; button.style.backgroundPosition = 'center';
    button.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !selected) button.classList.add('is-hovered'); });
    button.addEventListener('pointerleave', () => button.classList.remove('is-hovered'));
    button.addEventListener('click', event => {
      if (performance.now() >= suppressClickUntil && node.classList.contains('interactive')) openCard(button, ring, event.detail === 0);
    });
    ring.cards.push(button); node.append(button);
  }
  root.append(node); return ring;
});

// Recycle a viewport-sized pool instead of growing the DOM as the field moves.
function prepareField() {
  const mobile = innerWidth <= 760;
  field.width = mobile ? 320 : 400;
  field.gapX = field.width + (mobile ? 37.5 : 42.5);
  field.gapY = field.width * .75 + (mobile ? 35 : 37.5);
  const coverageZoom = Math.min(field.zoom, field.baseZoom) * .84;
  const columns = Math.ceil(innerWidth / (field.gapX * coverageZoom)) + 6;
  const rows = Math.ceil(innerHeight / (field.gapY * coverageZoom)) + 6;
  if (columns === field.columns && rows === field.rows) return;
  fieldRoot.replaceChildren(); field.cells = [];
  field.columns = columns; field.rows = rows;
  for (let slot = 0; slot < columns * rows; slot++) {
    const node = document.createElement('div'); node.className = 'field-cell';
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'tile field-tile'; button.tabIndex = -1;
    const cell = {node, button, slot, key: null, rotation: 0, worldScale: 1, field: true};
    button.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && !selected && !drag) { button.classList.add('is-hovered'); requestRender(); } });
    button.addEventListener('pointerleave', () => { button.classList.remove('is-hovered'); requestRender(); });
    button.addEventListener('focus', requestRender); button.addEventListener('blur', requestRender);
    button.addEventListener('click', e => {
      if (!drag && performance.now() >= suppressClickUntil) openCard(button, cell, e.detail === 0);
    });
    node.append(button); fieldRoot.append(node); field.cells.push(cell);
  }
}
function renderField(dt) {
  let animating = false;
  if (!selected) {
    const follow = reduced ? 1 : 1 - Math.exp(-dt / (drag ? 85 : 150));
    field.x += (field.targetX - field.x) * follow;
    field.y += (field.targetY - field.y) * follow;
    const zoomTarget = field.baseZoom * (drag && (drag.mouse || drag.moved) ? .86 : 1);
    field.zoom = Math.exp(Math.log(field.zoom) + Math.log(zoomTarget / field.zoom) * (reduced ? 1 : 1 - Math.exp(-dt / (drag ? 220 : 370))));
    if (field.zoomAnchor) {
      const anchor = field.zoomAnchor;
      field.x = anchor.worldX - anchor.x / field.zoom;
      field.y = anchor.worldY - anchor.y / field.zoom;
      field.targetX = field.x; field.targetY = field.y;
      if (Math.abs(Math.log(zoomTarget / field.zoom)) < .0001) field.zoomAnchor = null;
    }
  }
  const startColumn = Math.floor(field.x / field.gapX) - Math.floor(field.columns / 2);
  const startRow = Math.floor(field.y / field.gapY) - Math.floor(field.rows / 2);
  for (const cell of field.cells) {
    const col = startColumn + cell.slot % field.columns;
    const row = startRow + Math.floor(cell.slot / field.columns);
    const key = `${col}:${row}`;
    const index = ARTWORKS.length ? modulo(col + row * 7, ARTWORKS.length) : 0;
    const item = ARTWORKS[index];
    const button = cell.button;
    if (key !== cell.key && button !== selected?.button) {
      cell.key = key; button.classList.remove('is-hovered');
      button.dataset.artwork = index;
      button.style.backgroundImage = item ? `url("${item.thumb}")` : '';
      button.setAttribute('aria-label', `View ${item?.title || 'artwork'}`);
    }
    // Offset alternating rows; coordinates stay deterministic in both directions.
    const x = col * field.gapX + modulo(row, 2) * field.gapX / 2 - field.x;
    const y = row * field.gapY - field.y;
    const cardWidth = item ? Math.min(field.width, field.width * .75 * item.width / item.height) : field.width;
    const height = item ? cardWidth * item.height / item.width : 180;
    cell.cardWidth = cardWidth;
    cell.worldScale = field.zoom;
    cell.node.style.transform = `scale(${field.zoom})`;
    const visible = item && Math.abs(x * field.zoom) < innerWidth / 2 + field.width && Math.abs(y * field.zoom) < innerHeight / 2 + height;
    cell.node.style.visibility = visible ? '' : 'hidden';
    const inside = visible && Math.abs(x * field.zoom) < innerWidth / 2 - 40 && Math.abs(y * field.zoom) < innerHeight / 2 - 80;
    cell.node.setAttribute('aria-hidden', String(!inside));
    button.tabIndex = inside ? 0 : -1;
    const hovering = !selected && !drag && (button.classList.contains('is-hovered') || button.matches(':focus-visible'));
    const hover = Number(button.dataset.hoverScale || 1);
    const hoverScale = hover + ((hovering ? 1.055 : 1) - hover) * (reduced ? 1 : 1 - Math.exp(-dt / 170));
    if (Math.abs(hoverScale - (hovering ? 1.055 : 1)) > .0001) animating = true;
    button.dataset.hoverScale = hoverScale;
    button.dataset.worldAngle = '0';
    button.style.left = `${x}px`; button.style.top = `${y}px`;
    button.style.width = `${cardWidth}px`; button.style.height = `${height}px`;
    button.style.setProperty('--angle', '0deg'); button.style.setProperty('--hover', hoverScale);
    cell.node.style.zIndex = hovering ? '2' : '';
  }
  stage.dataset.fieldX = field.x.toFixed(2); stage.dataset.fieldY = field.y.toFixed(2);
  stage.dataset.fieldZoom = field.zoom.toFixed(4);
  if (!hintShown) {
    hintShown = true;
    hint.textContent = touchQuery.matches ? 'Drag to explore' : 'Drag to explore · Scroll to zoom';
    hint.classList.add('visible'); setTimeout(() => hint.classList.remove('visible'), 6000);
  }
  return animating || (!selected && (Math.abs(field.x - field.targetX) + Math.abs(field.y - field.targetY) > .05 || Math.abs(Math.log(field.zoom / (field.baseZoom * (drag && (drag.mouse || drag.moved) ? .86 : 1)))) > .0001));
}
function setView(nextView) {
  if (selected || drag || layoutMotion) return;
  const previousView = stage.dataset.view;
  const source = previousView && !reduced ? snapshotLayout(previousView) : [];
  if (frame) { cancelAnimationFrame(frame); frame = 0; }
  if (document.activeElement.classList.contains('tile')) document.activeElement.blur();
  view = nextView;
  fieldRoot.hidden = view !== 'field'; fieldRoot.inert = view !== 'field';
  root.hidden = view !== 'orbit'; root.inert = view !== 'orbit';
  stage.dataset.view = view; viewToggle.dataset.view = view;
  const label = view === 'field' ? 'Switch to orbit view' : 'Switch to field view';
  viewToggle.setAttribute('aria-label', label); viewToggle.title = label;
  field.zoomAnchor = null;
  if (view === 'field') { field.zoom = field.baseZoom; prepareField(); }
  else skipIntro = true;
  field.cells.forEach(cell => { cell.button.classList.remove('is-hovered'); cell.button.dataset.hoverScale = '1'; });
  rings.forEach(r => r.cards.forEach(button => { button.classList.remove('is-hovered'); button.dataset.hoverScale = '1'; }));
  hintShown = false;
  if (source.length) {
    // Measure the destination before paint, then move matching photographs.
    render(performance.now());
    beginLayoutMotion(source, snapshotLayout(view));
  }
  requestRender();
}
function snapshotLayout(layout) {
  const records = layout === 'field' ? field.cells.map(cell => ({button: cell.button, owner: cell})) : rings.flatMap(ring => ring.cards.map(button => ({button, owner: ring})));
  return records.flatMap(({button, owner}) => {
    const rect = button.getBoundingClientRect();
    const hover = Number(button.dataset.hoverScale || 1);
    const width = button.offsetWidth * owner.worldScale * hover;
    const height = button.offsetHeight * owner.worldScale * hover;
    if (!rect.width || width < .65 || !button.style.backgroundImage) return [];
    return [{x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width, height,
      angle: Number(button.dataset.worldAngle || 0), artwork: button.dataset.artwork,
      image: button.style.backgroundImage, layer: Number(owner.node.style.zIndex || 1),
      visible: getComputedStyle(owner.node).visibility !== 'hidden' && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight}];
  });
}
function nearestPhoto(photo, candidates) {
  const same = candidates.filter(candidate => candidate.artwork === photo.artwork);
  const choices = same.length ? same : candidates.filter(candidate => !candidate.visible);
  const closest = choices.reduce((best, candidate) => {
    const distance = (candidate.x - photo.x) ** 2 + (candidate.y - photo.y) ** 2 + (candidate.visible ? 0 : (innerWidth ** 2 + innerHeight ** 2) * 4);
    return !best || distance < best.distance ? {photo: candidate, distance} : best;
  }, null)?.photo;
  // Photos absent from a viewport enter from beyond its edge, avoiding
  // a different texture suddenly appearing over an existing photograph.
  if (same.length) return closest;
  return closest ? {...closest, artwork: photo.artwork, image: photo.image} : {...photo, x: innerWidth + photo.width, visible: false};
}
function beginLayoutMotion(source, destination) {
  if (!destination.length) return;
  const layer = document.createElement('div'); layer.className = 'layout-morph';
  layer.setAttribute('aria-hidden', 'true');
  const used = new Set(), cards = [];
  const add = (from, to) => {
    if (!from || !to) return;
    const node = document.createElement('div'); node.className = 'morph-card';
    node.style.backgroundImage = to.image;
    layer.append(node); cards.push({node, from, to});
  };
  for (const target of destination.filter(photo => photo.visible)) {
    const origin = nearestPhoto(target, source);
    used.add(origin); add(origin, target);
  }
  // Copies that are no longer needed converge into the same photograph;
  // the reverse transition naturally multiplies those copies again.
  for (const origin of source.filter(photo => photo.visible && !used.has(photo))) add(origin, nearestPhoto(origin, destination));
  fieldRoot.style.visibility = 'hidden'; root.style.visibility = 'hidden';
  stage.append(layer); stage.setAttribute('aria-busy', 'true'); viewToggle.disabled = true;
  layoutMotion = {layer, cards, start: performance.now(), duration: 2800};
  renderLayoutMotion(layoutMotion.start);
}
function renderLayoutMotion(now) {
  const t = reduced ? 1 : clamp((now - layoutMotion.start) / layoutMotion.duration, 0, 1);
  const p = accelerate(t);
  for (const {node, from, to} of layoutMotion.cards) {
    const x = from.x + (to.x - from.x) * p, y = from.y + (to.y - from.y) * p;
    const width = Math.exp(Math.log(from.width) + Math.log(to.width / from.width) * p);
    const height = Math.exp(Math.log(from.height) + Math.log(to.height / from.height) * p);
    const turn = modulo(to.angle - from.angle + 180, 360) - 180;
    node.style.width = `${width}px`; node.style.height = `${height}px`;
    node.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%) rotate(${from.angle + turn * p}deg)`;
    node.style.zIndex = String(Math.round(from.layer + (to.layer - from.layer) * p));
  }
  stage.dataset.transition = 'morphing'; stage.dataset.transitionProgress = p.toFixed(4);
  if (t === 1) finishLayoutMotion();
}
function finishLayoutMotion() {
  layoutMotion.layer.remove(); layoutMotion = null;
  fieldRoot.style.visibility = ''; root.style.visibility = '';
  stage.setAttribute('aria-busy', 'false'); stage.dataset.transition = 'idle';
  viewToggle.disabled = false;
  announcement.textContent = view === 'field' ? 'Field view. Drag to explore; scroll to zoom.' : 'Orbit view.';
  if (pendingArtworks) { const items = pendingArtworks; pendingArtworks = null; setArtworks(items); }
}
viewToggle.addEventListener('click', () => setView(view === 'field' ? 'orbit' : 'field'));
document.addEventListener('pointermove', e => {
  const corner = e.clientX > innerWidth - 90 && e.clientY < 145;
  viewControl.classList.toggle('is-visible', !selected && (corner || viewControl.contains(e.target)));
});
document.documentElement.addEventListener('pointerleave', () => viewControl.classList.remove('is-visible'));

function requestRender() {
  if (!frame && !document.hidden) { lastTime = performance.now(); frame = requestAnimationFrame(render); }
}
function resize() {
  if (layoutMotion) finishLayoutMotion();
  const brand = document.querySelector('.brand-name');
  if (brand) brand.style.setProperty('--brand-scale', brand.clientWidth / 487);
  scale = Math.min(innerWidth / 1080, innerHeight / 1080);
  if (!selected) prepareField();
  if (selected) positionExpanded();
  requestRender();
}
function render(now) {
  const dt = clamp(now - lastTime, 0, 50); lastTime = now;
  if (layoutMotion) {
    renderLayoutMotion(now);
    frame = requestAnimationFrame(render); return;
  }
  if (cameraMotion) {
    const t = reduced ? 1 : clamp((now - cameraMotion.start) / cameraMotion.duration, 0, 1);
    camera = cameraMotion.from + (cameraMotion.to - cameraMotion.from) * accelerate(t);
    if (t === 1) {
      const returning = cameraMotion.to === 0;
      cameraMotion = null;
      if (returning) finishReturn();
      else { closeButton.hidden = false; closeButton.focus({ preventScroll: true }); }
    }
  }
  if (view === 'field') {
    const fieldAnimating = renderField(dt);
    renderCamera(dt);
    stage.dataset.ready = 'true';
    stage.dataset.introPhase = 'field';
    frame = (cameraMotion || fieldAnimating) ? requestAnimationFrame(render) : 0;
    return;
  }
  const elapsed = now - startTime;
  const introDone = skipIntro || elapsed >= CONFIG.introDuration;
  if (motion && !viewer.open) {
    const seconds = dt / 1000, omega = 5;
    const displacement = manual - motion.to;
    const coefficient = manualVelocity + omega * displacement;
    const decay = Math.exp(-omega * seconds);
    manual = motion.to + (displacement + coefficient * seconds) * decay;
    manualVelocity = (manualVelocity - omega * coefficient * seconds) * decay;
    if (Math.abs(manual - motion.to) < .00005 && Math.abs(manualVelocity) < .0001) {
      manual = motion.to; manualVelocity = 0; motion = null;
    }
  }
  if (introDone && !reduced) {
    spin += dt / 1000 * CONFIG.rotation * (1 - .94 * camera);
    if (!viewer.open) drift += dt / 1000 * CONFIG.idle;
  }
  progress = manual + drift;
  const base = Math.floor(progress);
  for (let slot = 0; slot < rings.length; slot++) {
    const ring = rings[slot];
    const sequence = base - CONFIG.inner + slot;
    const depth = sequence - progress;
    const replicate = introDone ? 1 : accelerate((elapsed - 4700) / 2900);
    const multiplier = Math.pow(CONFIG.ratio, depth * replicate);
    ring.worldScale = scale * multiplier;
    const direction = modulo(sequence, 2) === 0 ? 1 : -1;
    ring.rotation = introDone ? direction * spin * (1 + modulo(sequence, 3) * .12) + sequence * 15 : sequence * 15 * replicate;
    const size = CONFIG.size * ring.worldScale;
    const offscreen = CONFIG.radius * ring.worldScale - size > Math.hypot(innerWidth / 2, innerHeight / 2);
    const visible = size >= CONFIG.minimumPixel && (selected || !offscreen) && (introDone || sequence === 0 || elapsed >= 4700);
    ring.node.style.display = visible ? '' : 'none';
    ring.node.style.transform = `scale(${ring.worldScale}) rotate(${ring.rotation}deg)`;
    ring.node.style.zIndex = String(100 - Math.round(Math.abs(depth) * 4));
    ring.node.dataset.depth = depth.toFixed(4);
    ring.node.dataset.cardSize = size.toFixed(4);
    const active = visible && introDone && sequence === Math.round(progress);
    const interactive = visible && introDone;
    ring.node.classList.toggle('active', active);
    ring.node.classList.toggle('interactive', interactive);
    ring.node.inert = !interactive;
    ring.node.setAttribute('aria-hidden', String(!interactive));
    ring.node.dataset.rotation = ring.rotation.toFixed(5);
    ring.node.dataset.sequence = sequence;
    if (ring.sequence !== sequence && ARTWORKS.length) {
      ring.sequence = sequence;
      ring.cards.forEach((button, i) => {
        const item = ARTWORKS[modulo(sequence * 12 + i, ARTWORKS.length)];
        button.dataset.artwork = modulo(sequence * 12 + i, ARTWORKS.length);
        button.style.backgroundImage = `url("${item.thumb}")`;
        button.setAttribute('aria-label', `View ${item.title}`);
      });
    }
    if (!visible) continue;
    ring.cards.forEach((button, index) => {
      const angle = index * Math.PI / 6 - Math.PI / 2;
      let x = CONFIG.radius * Math.cos(angle), y = CONFIG.radius * Math.sin(angle);
      let tilt = 25 * Math.sin(2 * (angle + Math.PI / 2) + ring.rotation * Math.PI / 180);
      let cardScale = 1, show = true;
      if (!introDone && sequence === 0) {
        if (elapsed < 1100) { show = index === 0; x = 0; y = 0; tilt = 0; cardScale = .45 + .55 * accelerate(elapsed / 1100); }
        else if (elapsed < 2600) {
          show = [0, 4, 8].includes(index);
          const direction = index === 4 ? -1 : index === 8 ? 1 : 0;
          const spread = accelerate((elapsed - 1100) / 1500);
          x = direction * 225 * spread; y = 0; tilt = direction * 15 * spread;
        } else if (elapsed < 4700) {
          const spread = accelerate((elapsed - 2600) / 2100);
          const parent = index % 3 === 1 ? -225 : index % 3 === 2 ? 225 : 0;
          const parentTilt = index % 3 === 1 ? -15 : index % 3 === 2 ? 15 : 0;
          x = parent + (x - parent) * spread; y *= spread; tilt = parentTilt + (tilt - parentTilt) * spread;
        }
      }
      const hovering = !selected && interactive && (button.classList.contains('is-hovered') || button.matches(':focus-visible'));
      button.style.zIndex = !introDone && sequence === 0 && [0, 4, 8].includes(index) ? '3' : hovering ? '4' : '';
      const desired = hovering ? 1.17 : 1;
      const previous = Number(button.dataset.hoverScale || 1);
      const hoverScale = reduced ? desired : previous + (desired - previous) * (1 - Math.exp(-dt / 170));
      button.dataset.hoverScale = hoverScale;
      button.dataset.worldAngle = tilt;
      button.style.left = `${x}px`; button.style.top = `${y}px`;
      button.style.setProperty('--angle', `${tilt - ring.rotation}deg`);
      button.style.setProperty('--hover', cardScale * hoverScale);
      button.style.visibility = show && ARTWORKS.length ? '' : 'hidden';
      button.style.height = selected?.button === button ? `${CONFIG.size * (1 + (selected.item.height / selected.item.width - 1) * camera)}px` : ''; 
      button.tabIndex = active ? 0 : -1;
    });
  }
  renderCamera(dt);
  if (introDone && !hintShown) {
    hintShown = true;
    if (!interacted) {
      hint.textContent = touchQuery.matches ? 'Swipe to explore' : 'Scroll to explore';
      hint.classList.add('visible'); setTimeout(() => hint.classList.remove('visible'), 6000);
    }
  }
  stage.dataset.ready = String(introDone);
  stage.dataset.progress = progress.toFixed(5);
  stage.dataset.spin = spin.toFixed(5);
  stage.dataset.introPhase = introDone ? 'tube' : elapsed < 1100 ? 'seed' : elapsed < 2600 ? 'three' : elapsed < 4700 ? 'twelve' : 'multiplying-rings';
  if (!reduced || motion || cameraMotion) frame = requestAnimationFrame(render); else frame = 0;
}
function interact() { interacted = true; skipIntro = true; hint.classList.remove('visible'); }
function move(delta, direct = false) {
  if (viewer.open) return;
  interact();
  const destination = (motion ? motion.to : manual) + delta;
  if (reduced || direct) { manual = destination; manualVelocity = 0; motion = null; }
  else if (motion) motion.to = destination;
  else motion = { to: destination };
  requestRender();
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { announcement.textContent = 'Moving between rings. Select an artwork.'; }, 950);
}
stage.addEventListener('wheel', e => {
  if (e.ctrlKey) return;
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? innerHeight : 1;
  if (view === 'field') {
    if (viewer.open || layoutMotion || drag || e.shiftKey || !e.deltaY) return;
    interact();
    field.baseZoom = clamp(field.baseZoom * Math.exp(-clamp(e.deltaY * unit, -480, 480) * .0018), .45, 2.5);
    field.zoomAnchor = {x: e.clientX - innerWidth / 2, y: e.clientY - innerHeight / 2,
      worldX: field.x + (e.clientX - innerWidth / 2) / field.zoom,
      worldY: field.y + (e.clientY - innerHeight / 2) / field.zoom};
    prepareField();
    requestRender(); return;
  }
  if (layoutMotion || e.shiftKey) return;
  move(clamp(e.deltaY * unit, -480, 480) / 850);
}, { passive: false });
stage.addEventListener('pointerdown', e => {
  if (layoutMotion) return;
  if (view === 'field') {
    if (viewer.open || e.button !== 0) return;
    interact(); field.zoomAnchor = null;
    field.targetX = field.x; field.targetY = field.y;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, previousX: e.clientX, previousY: e.clientY, moved: false, field: true, mouse: e.pointerType === 'mouse', capture: null };
    // Capture on the pressed card so an ordinary release still generates its
    // click, even while the camera pulls back or the pointer leaves the card.
    if (drag.mouse) { drag.capture = e.target.closest('.field-tile') || stage; drag.capture.setPointerCapture(e.pointerId); }
    if (drag.mouse) stage.classList.add('is-dragging');
    field.cells.forEach(cell => cell.button.classList.remove('is-hovered'));
    requestRender(); return;
  }
  if (e.pointerType === 'mouse' || viewer.open) return;
  drag = { id: e.pointerId, start: e.clientY, previous: e.clientY, moved: false };
});
stage.addEventListener('pointermove', e => {
  if (!drag || drag.id !== e.pointerId) return;
  if (drag.field) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
      if (!drag.moved && !drag.capture) { drag.capture = stage; stage.setPointerCapture(e.pointerId); }
      drag.moved = true;
      stage.classList.add('is-dragging');
    }
    if (drag.moved) {
      field.targetX -= (e.clientX - drag.previousX) / field.zoom;
      field.targetY -= (e.clientY - drag.previousY) / field.zoom;
      suppressClickUntil = performance.now() + 350;
      requestRender();
    }
    drag.previousX = e.clientX; drag.previousY = e.clientY; return;
  }
  const distance = drag.previous - e.clientY;
  if (Math.abs(e.clientY - drag.start) > 8) drag.moved = true;
  if (drag.moved) { move(distance / Math.max(300, innerHeight * .65)); suppressClickUntil = performance.now() + 350; }
  drag.previous = e.clientY;
});
function endDrag(e) {
  if (drag?.id !== e.pointerId) return;
  if (e.type === 'lostpointercapture' && e.target !== drag.capture) return;
  const capture = drag.capture;
  if (drag.moved) suppressClickUntil = performance.now() + 350;
  drag = null; stage.classList.remove('is-dragging');
  if (capture?.hasPointerCapture(e.pointerId)) capture.releasePointerCapture(e.pointerId);
  requestRender();
}
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
stage.addEventListener('lostpointercapture', endDrag);
document.addEventListener('keydown', e => {
  if (viewer.open || layoutMotion) return;
  if (e.target.closest('a, .view-toggle')) return;
  if (view === 'field') {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home'].includes(e.key)) {
      e.preventDefault(); interact();
      if (e.key === 'Home') { field.targetX = 0; field.targetY = 0; }
      else if (e.key === 'ArrowLeft') field.targetX -= 180;
      else if (e.key === 'ArrowRight') field.targetX += 180;
      else field.targetY += (['ArrowUp', 'PageUp'].includes(e.key) ? -1 : 1) * (e.key.startsWith('Page') ? innerHeight * .75 : 180);
      requestRender();
    }
    return;
  }
  const tile = document.activeElement.classList.contains('tile');
  if (e.key === ' ' && tile) return;
  if (['ArrowDown', 'PageDown', 'ArrowUp', 'PageUp', 'Home', 'End', ' '].includes(e.key)) {
    e.preventDefault();
    if (e.key === 'Home') { drift = 0; manual = 0; motion = null; move(0, true); }
    else if (e.key === 'End') move(5);
    else move(['ArrowUp', 'PageUp'].includes(e.key) || e.shiftKey ? -1 : 1);
  }
  if (['ArrowLeft', 'ArrowRight'].includes(e.key) && tile) {
    e.preventDefault();
    const currentRing = document.activeElement.closest('.ring');
    const ringButtons = [...currentRing.querySelectorAll('.tile')];
    const i = ringButtons.indexOf(document.activeElement);
    ringButtons[modulo(i + (e.key === 'ArrowRight' ? 1 : -1), ringButtons.length)]?.focus();
  }
});
function expandedGeometry() {
  const ratio = selected.item.width / selected.item.height;
  const width = Math.min(1000 * innerHeight / 1080, innerWidth - 40, (innerHeight - 100) * ratio);
  return { left: (innerWidth - width) / 2, top: (innerHeight - width / ratio) / 2, width, height: width / ratio };
}
function positionExpanded() {
  const g = expandedGeometry();
  closeButton.style.left = `${g.left + g.width - 102}px`;
  closeButton.style.top = `${Math.max(8, g.top - 40)}px`;
}
function renderCamera(dt) {
  const sceneRoot = view === 'field' ? fieldRoot : root;
  if (!selected) {
    sceneRoot.style.transform = ''; sceneRoot.style.filter = ''; stage.style.filter = ''; vignette.style.transform = '';
    previousCameraLog = 0; cameraBlur = 0;
    stage.dataset.camera = '0'; stage.dataset.blur = '0';
    return;
  }
  const {button, ring} = selected;
  const target = expandedGeometry();
  const cardSize = ring.field ? ring.cardWidth : CONFIG.size;
  const zoom = Math.exp(Math.log(target.width / (cardSize * ring.worldScale)) * camera);
  const angle = -Number(button.dataset.worldAngle) * camera;
  const radians = (ring.rotation + angle) * Math.PI / 180;
  const x = parseFloat(button.style.left), y = parseFloat(button.style.top);
  const px = ring.worldScale * (x * Math.cos(radians) - y * Math.sin(radians));
  const py = ring.worldScale * (x * Math.sin(radians) + y * Math.cos(radians));
  const original = ring.rotation * Math.PI / 180;
  const ox = ring.worldScale * (x * Math.cos(original) - y * Math.sin(original));
  const oy = ring.worldScale * (x * Math.sin(original) + y * Math.cos(original));
  const tx = -px * zoom + ox * (1 - camera), ty = -py * zoom + oy * (1 - camera);
  sceneRoot.style.transform = `translate3d(${tx}px,${ty}px,0) rotate(${angle}deg) scale(${zoom})`;
  // The same card follows the camera in screen coordinates, avoiding tiny-layer upscaling.
  const hover = Number(button.dataset.hoverScale || 1);
  const width = cardSize * ring.worldScale * zoom * (1 + (hover - 1) * (1 - camera));
  button.style.left = `${innerWidth / 2 + ox * (1 - camera)}px`;
  button.style.top = `${innerHeight / 2 + oy * (1 - camera)}px`;
  button.style.width = `${width}px`;
  button.style.height = `${width * (ring.field ? selected.item.height / selected.item.width : 1 + (selected.item.height / selected.item.width - 1) * camera)}px`;
  button.style.transform = `translate(-50%,-50%) rotate(${Number(button.dataset.worldAngle) * (1 - camera)}deg)`;
  vignette.style.transform = '';
  const log = Math.log(zoom);
  const speed = dt ? Math.abs(log - previousCameraLog) / (dt / 1000) : 0;
  previousCameraLog = log;
  const desired = reduced ? 0 : Math.min(10, Math.max(0, speed - .5) * 1.7) * Math.sin(Math.PI * camera);
  cameraBlur += (desired - cameraBlur) * (1 - Math.exp(-dt / 70));
  if (!cameraMotion) cameraBlur = 0;
  const surroundingBlur = cameraBlur + 3.5 * accelerate(camera);
  // Filter is evaluated before the camera transform; compensate for its scale.
  sceneRoot.style.filter = surroundingBlur > .05 ? `blur(${(surroundingBlur / zoom).toFixed(4)}px)` : '';
  stage.style.filter = '';
  stage.dataset.surroundingBlur = surroundingBlur.toFixed(3);
  stage.dataset.camera = camera.toFixed(5); stage.dataset.blur = cameraBlur.toFixed(3);
  stage.dataset.peakBlur = Math.max(Number(stage.dataset.peakBlur || 0), cameraBlur).toFixed(3);
  if (view === 'field') return;
  const ca = angle * Math.PI / 180;
  for (const r of rings) for (const card of r.cards) {
    if (card === button || r.node.style.display === 'none') continue;
    const rr = r.rotation * Math.PI / 180;
    const cx = parseFloat(card.style.left), cy = parseFloat(card.style.top);
    const wx = r.worldScale * (cx * Math.cos(rr) - cy * Math.sin(rr));
    const wy = r.worldScale * (cx * Math.sin(rr) + cy * Math.cos(rr));
    const sx = innerWidth / 2 + tx + zoom * (wx * Math.cos(ca) - wy * Math.sin(ca));
    const sy = innerHeight / 2 + ty + zoom * (wx * Math.sin(ca) + wy * Math.cos(ca));
    const margin = CONFIG.size * r.worldScale * zoom;
    if (sx + margin < 0 || sx - margin > innerWidth || sy + margin < 0 || sy - margin > innerHeight) card.style.visibility = 'hidden';
  }
}
function openCard(button, ring, returnKeyboardFocus) {
  if (selected || layoutMotion || !ARTWORKS.length) return;
  if (ring.field) { field.targetX = field.x; field.targetY = field.y; field.zoomAnchor = null; }
  interact(); motion = null; manualVelocity = 0;
  const item = ARTWORKS[Number(button.dataset.artwork)];
  stage.dataset.peakBlur = '0';
  selected = {button, ring, item, returnKeyboardFocus};
  rings.forEach(r => r.cards.forEach(card => card.classList.remove('is-hovered')));
  field.cells.forEach(cell => cell.button.classList.remove('is-hovered'));
  stage.append(button); button.classList.add('camera-card');
  title.textContent = item.title;
  expandedImage.alt = item.title;
  const full = new Image(); full.src = item.image;
  full.decode().then(() => { if (selected?.button === button) button.style.backgroundImage = `url("${item.image}")`; }).catch(() => {});
  const zoom = expandedGeometry().width / ((ring.field ? ring.cardWidth : CONFIG.size) * ring.worldScale);
  cameraMotion = {from: camera, to: 1, start: performance.now(), duration: 1200 + Math.min(950, Math.abs(Math.log(zoom)) * 150)};
  closing = false; viewer.showModal(); positionExpanded(); closeButton.hidden = true;
  requestRender();
}
function closeCard() {
  if (!selected || closing) return;
  closing = true; closeButton.hidden = true;
  cameraMotion = {from: camera, to: 0, start: performance.now(), duration: Math.max(700, 1500 * camera)};
  requestRender();
}
function finishReturn() {
  const button = selected.button;
  const returnKeyboardFocus = selected.returnKeyboardFocus;
  button.style.backgroundImage = `url("${selected.item.thumb}")`; button.style.height = ''; button.style.width = ''; button.style.transform = '';
  button.classList.remove('camera-card', 'is-hovered'); selected.ring.node.append(button);
  selected = null; closing = false; viewer.close();
  if (view === 'field') prepareField();
  if (pendingArtworks) { setArtworks(pendingArtworks); pendingArtworks = null; }
  // The dialog can restore focus itself. Escape must not turn a mouse click
  // into a persistent keyboard highlight on the returning image.
  if (returnKeyboardFocus) button.focus({ preventScroll: true });
  else if (document.activeElement === button) button.blur();
}
function setArtworks(items) {
  if (selected || layoutMotion) { pendingArtworks = items; return; }
  ARTWORKS = items;
  field.cells.forEach(cell => { cell.key = null; });
  rings.forEach(ring => { ring.sequence = null; }); requestRender();
}
if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
  const updates = new EventSource('/__gallery/events');
  updates.addEventListener('images', event => setArtworks(JSON.parse(event.data)));
}
closeButton.addEventListener('click', closeCard); shade.addEventListener('click', closeCard);
viewer.addEventListener('cancel', e => { e.preventDefault(); closeCard(); });
window.addEventListener('resize', resize);
motionQuery.addEventListener('change', e => { reduced = e.matches; if (reduced) skipIntro = true; requestRender(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else requestRender(); });
setView('field'); resize();
