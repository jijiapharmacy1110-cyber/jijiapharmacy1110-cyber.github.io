/* Accessible, touch-friendly cat photo carousels. */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('.cat-team-grid, .lulu-gallery').forEach(function (track, n) {
    var slides = Array.from(track.children);
    if (slides.length < 2) return;
    var index = 0, paused = reduced.matches, hovered = false, timer;
    track.classList.add('cat-carousel');
    track.id = track.id || 'cat-carousel-' + n;
    track.setAttribute('role', 'region');
    track.setAttribute('aria-label', n === 0 ? '貓咪團隊輪播' : '嚕嚕生活照片輪播');
    track.tabIndex = 0;
    var controls = document.createElement('div');
    controls.className = 'cat-carousel-controls';
    controls.innerHTML = '<button type="button" data-prev aria-label="上一張">←</button><span data-count aria-live="off"></span><button type="button" data-next aria-label="下一張">→</button><button type="button" data-toggle></button>';
    track.after(controls);
    var count = controls.querySelector('[data-count]'), toggle = controls.querySelector('[data-toggle]');
    controls.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-controls', track.id); });
    function update() {
      count.textContent = (index + 1) + ' / ' + slides.length;
      toggle.textContent = paused ? '播放輪播' : '暫停輪播';
      toggle.setAttribute('aria-label', paused ? '播放自動輪播' : '暫停自動輪播');
    }
    function position(i) { return slides[i].offsetLeft - slides[0].offsetLeft; }
    function go(i) {
      index = (i + slides.length) % slides.length;
      track.scrollTo({left: position(index), behavior: reduced.matches ? 'auto' : 'smooth'});
      update();
    }
    function stop() { paused = true; update(); }
    controls.querySelector('[data-prev]').addEventListener('click', function () { stop(); go(index - 1); });
    controls.querySelector('[data-next]').addEventListener('click', function () { stop(); go(index + 1); });
    toggle.addEventListener('click', function () { paused = !paused; update(); });
    track.addEventListener('pointerdown', stop, {passive:true});
    track.addEventListener('wheel', stop, {passive:true});
    track.addEventListener('mouseenter', function () { hovered = true; });
    track.addEventListener('mouseleave', function () { hovered = false; });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault(); stop(); go(index + (e.key === 'ArrowRight' ? 1 : -1));
      }
    });
    track.addEventListener('scroll', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        index = slides.reduce(function (best, slide, i) {
          return Math.abs(position(i) - track.scrollLeft) < Math.abs(position(best) - track.scrollLeft) ? i : best;
        }, 0); update();
      }, 120);
    }, {passive:true});
    reduced.addEventListener('change', function (event) { if(event.matches) stop(); });
    window.addEventListener('resize', function () { track.scrollTo({left:position(index),behavior:'instant'}); });
    setInterval(function () {
      var rect = track.getBoundingClientRect();
      if (!paused && !hovered && !document.hidden && !track.contains(document.activeElement) && !controls.contains(document.activeElement) && rect.bottom > 0 && rect.top < window.innerHeight) go(index + 1);
    }, 5000);
    update();
  });
})();