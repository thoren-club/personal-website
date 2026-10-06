(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&+?';
  const brand = document.querySelector('.brand-name');
  const original = brand.querySelector('img');
  brand.setAttribute('aria-label', original.alt);
  const lettering = document.createElement('span');
  lettering.className = 'brand-reveal-text';
  lettering.setAttribute('aria-hidden', 'true');
  brand.append(lettering); brand.classList.add('is-revealing');
  const elements = [lettering, document.querySelector('.portfolio-email'), document.querySelector('.portfolio-description')];
  const entries = elements.map((element, index) => {
    const text = index === 0 ? original.alt : element.textContent;
    const visual = document.createElement('span'); visual.setAttribute('aria-hidden', 'true');
    if (index !== 0) {
      const accessible = document.createElement('span'); accessible.className = 'sr-only'; accessible.textContent = text;
      element.replaceChildren(accessible, visual);
    } else element.append(visual);
    const characters = Array.from(text);
    const cells = characters.map(character => {
      const cell = document.createElement('span'); cell.className = 'scramble-character';
      cell.textContent = character; visual.append(cell); return cell;
    });
    const resolveAt = characters.map((_, i) => .15 + i / Math.max(1, characters.length - 1) * .73 + Math.random() * .1);
    return {element, text, characters, cells, resolveAt, done:false};
  });
  let started = performance.now(), lastStep = -1;
  const duration = 1400, stagger = 130;
  function render(now) {
    const step = Math.floor((now - started) / 65);
    let pending = false;
    entries.forEach((entry, index) => {
      if (entry.done) return;
      const progress = Math.min(1, Math.max(0, now - started - index * stagger) / duration);
      if (progress === 1) {
        entry.done = true;
        if (index === 0) { brand.classList.remove('is-revealing'); lettering.remove(); }
        else entry.element.textContent = entry.text;
        return;
      }
      pending = true;
      if (step !== lastStep) entry.cells.forEach((cell, i) => {
        const character = entry.characters[i];
        cell.textContent = /\s/.test(character) || progress >= entry.resolveAt[i] ? character : alphabet[Math.floor(Math.random() * alphabet.length)];
      });
      if (index === 0) lettering.style.transform = `scale(${brand.clientWidth / lettering.offsetWidth}, ${brand.clientHeight / 76})`;
    });
    lastStep = step;
    if (pending) requestAnimationFrame(render);
  }
  // Fix glyph slots to the real text, so random symbols do not change line lengths.
  function measure() {
    entries.forEach(entry => entry.cells.forEach((cell, i) => {
      cell.style.width = ''; cell.textContent = entry.characters[i];
      cell.style.width = `${cell.getBoundingClientRect().width}px`;
    }));
  }
  measure(); render(started);
})();
