let ARTWORKS = window.GALLERY_IMAGES || [];
const GREETINGS = [
  'Привет', 'Hello', '你好', 'नमस्ते', 'Hola',
  'Bonjour', 'مرحباً', 'Olá', 'হ্যালো', 'ہیلو',
  'Halo', 'Hallo', 'こんにちは', '안녕하세요', 'Ciao',
  'Merhaba', 'Xin chào', 'வணக்கம்', 'నమస్తే', 'سلام',
];
let greetingIndex = 0;
document.title = GREETINGS[greetingIndex];
setInterval(() => {
  greetingIndex = (greetingIndex + 1) % GREETINGS.length;
  document.title = GREETINGS[greetingIndex];
}, 2000);
let pendingArtworks = null;
const vignette = document.querySelector(".vignette");
let camera = 0, cameraMotion = null, previousCameraLog = 0, cameraBlur = 0;
const stage = document.querySelector('#gallery');
const root = document.querySelector('#rings');
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
    button.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') button.classList.add('is-hovered'); });
    button.addEventListener('pointerleave', () => button.classList.remove('is-hovered'));
    button.addEventListener('click', () => {
      if (performance.now() >= suppressClickUntil && node.classList.contains('interactive')) openCard(button, ring);
    });
    ring.cards.push(button); node.append(button);
  }
  root.append(node); return ring;
});

function requestRender() {
  if (!frame && !document.hidden) { lastTime = performance.now(); frame = requestAnimationFrame(render); }
}
function resize() {
  const brand = document.querySelector('.brand-name');
  if (brand) brand.style.setProperty('--brand-scale', brand.clientWidth / 487);
  scale = Math.min(innerWidth / 1080, innerHeight / 1080);
  if (selected) positionExpanded();
  requestRender();
}
function render(now) {
  const dt = clamp(now - lastTime, 0, 50); lastTime = now;
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
        button.setAttribute('aria-label', `Открыть ${item.title}`);
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
      hint.textContent = touchQuery.matches ? 'Проведите вверх, чтобы исследовать' : 'Прокрутите, чтобы исследовать';
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
  announceTimer = setTimeout(() => { announcement.textContent = 'Следующее кольцо. Выберите работу.'; }, 950);
}
stage.addEventListener('wheel', e => {
  if (e.ctrlKey) return;
  e.preventDefault();
  const unit = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? innerHeight : 1;
  move(clamp(e.deltaY * unit, -480, 480) / 850);
}, { passive: false });
stage.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || viewer.open) return;
  drag = { id: e.pointerId, start: e.clientY, previous: e.clientY, moved: false };
});
stage.addEventListener('pointermove', e => {
  if (!drag || drag.id !== e.pointerId) return;
  const distance = drag.previous - e.clientY;
  if (Math.abs(e.clientY - drag.start) > 8) drag.moved = true;
  if (drag.moved) { move(distance / Math.max(300, innerHeight * .65)); suppressClickUntil = performance.now() + 350; }
  drag.previous = e.clientY;
});
function endDrag(e) { if (drag?.id === e.pointerId) drag = null; }
stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
document.addEventListener('keydown', e => {
  if (viewer.open) return;
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
  if (!selected) {
    root.style.transform = ''; root.style.filter = ''; stage.style.filter = ''; vignette.style.transform = '';
    previousCameraLog = 0; cameraBlur = 0;
    stage.dataset.camera = '0'; stage.dataset.blur = '0';
    return;
  }
  const {button, ring} = selected;
  const target = expandedGeometry();
  const zoom = Math.exp(Math.log(target.width / (CONFIG.size * ring.worldScale)) * camera);
  const angle = -Number(button.dataset.worldAngle) * camera;
  const radians = (ring.rotation + angle) * Math.PI / 180;
  const x = parseFloat(button.style.left), y = parseFloat(button.style.top);
  const px = ring.worldScale * (x * Math.cos(radians) - y * Math.sin(radians));
  const py = ring.worldScale * (x * Math.sin(radians) + y * Math.cos(radians));
  const original = ring.rotation * Math.PI / 180;
  const ox = ring.worldScale * (x * Math.cos(original) - y * Math.sin(original));
  const oy = ring.worldScale * (x * Math.sin(original) + y * Math.cos(original));
  const tx = -px * zoom + ox * (1 - camera), ty = -py * zoom + oy * (1 - camera);
  root.style.transform = `translate3d(${tx}px,${ty}px,0) rotate(${angle}deg) scale(${zoom})`;
  // The same card follows the camera in screen coordinates, avoiding tiny-layer upscaling.
  const hover = Number(button.dataset.hoverScale || 1);
  const width = CONFIG.size * ring.worldScale * zoom * hover;
  button.style.left = `${innerWidth / 2 + ox * (1 - camera)}px`;
  button.style.top = `${innerHeight / 2 + oy * (1 - camera)}px`;
  button.style.width = `${width}px`;
  button.style.height = `${width * (1 + (selected.item.height / selected.item.width - 1) * camera)}px`;
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
  root.style.filter = surroundingBlur > .05 ? `blur(${(surroundingBlur / zoom).toFixed(4)}px)` : '';
  stage.style.filter = '';
  stage.dataset.surroundingBlur = surroundingBlur.toFixed(3);
  stage.dataset.camera = camera.toFixed(5); stage.dataset.blur = cameraBlur.toFixed(3);
  stage.dataset.peakBlur = Math.max(Number(stage.dataset.peakBlur || 0), cameraBlur).toFixed(3);
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
function openCard(button, ring) {
  if (selected || !ARTWORKS.length) return;
  interact(); motion = null; manualVelocity = 0;
  const item = ARTWORKS[Number(button.dataset.artwork)];
  stage.dataset.peakBlur = '0';
  selected = {button, ring, item};
  stage.append(button); button.classList.add('camera-card');
  title.textContent = item.title;
  expandedImage.alt = item.title;
  const full = new Image(); full.src = item.image;
  full.decode().then(() => { if (selected?.button === button) button.style.backgroundImage = `url("${item.image}")`; }).catch(() => {});
  const zoom = expandedGeometry().width / (CONFIG.size * ring.worldScale);
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
  button.style.backgroundImage = `url("${selected.item.thumb}")`; button.style.height = ''; button.style.width = ''; button.style.transform = '';
  button.classList.remove('camera-card'); selected.ring.node.append(button);
  selected = null; closing = false; viewer.close();
  if (pendingArtworks) { setArtworks(pendingArtworks); pendingArtworks = null; }
  if (!touchQuery.matches) button.focus({ preventScroll: true });
}
function setArtworks(items) {
  if (selected) { pendingArtworks = items; return; }
  ARTWORKS = items;
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
resize();
