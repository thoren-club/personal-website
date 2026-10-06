(() => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fonts = [
    'Georgia, serif', 'Courier New, monospace', 'Impact, sans-serif',
    'Times New Roman, serif', 'Arial Black, sans-serif', 'Trebuchet MS, sans-serif',
    'Verdana, sans-serif', 'Courier New, monospace', 'Georgia, serif',
    'Arial, sans-serif', 'Inter, sans-serif',
  ];
  const brand = document.querySelector('.brand-name');
  const original = brand.querySelector('img');
  brand.setAttribute('aria-label', original.alt);
  const lettering = document.createElement('span');
  lettering.className = 'brand-reveal-text';
  lettering.textContent = original.alt;
  lettering.setAttribute('aria-hidden', 'true');
  brand.append(lettering);
  brand.classList.add('is-revealing');
  const targets = [lettering, document.querySelector('.portfolio-email'), document.querySelector('.portfolio-description')];
  const started = performance.now();
  const duration = 1300, stagger = 130;
  const states = targets.map(() => -1);
  function render(now) {
    let pending = false;
    targets.forEach((element, index) => {
      const elapsed = Math.max(0, now - started - index * stagger);
      const progress = Math.min(1, elapsed / duration);
      // Fast font changes at the start, with longer holds before the final face.
      const step = Math.min(fonts.length - 1, Math.floor(Math.pow(progress, .7) * fonts.length));
      if (states[index] !== step) {
        states[index] = step;
        element.style.fontFamily = fonts[step];
        element.style.fontStyle = step === 0 || step === 3 || step === 8 ? 'italic' : 'normal';
      }
      if (index === 0 && progress < 1) {
        // Keep every temporary face inside the original wordmark's footprint.
        lettering.style.transform = `scale(${brand.clientWidth / lettering.offsetWidth}, ${brand.clientHeight / 76})`;
      }
      if (progress === 1) {
        element.style.fontFamily = ''; element.style.fontStyle = '';
        if (index === 0) { brand.classList.remove('is-revealing'); lettering.remove(); }
      } else pending = true;
    });
    if (pending) requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();
