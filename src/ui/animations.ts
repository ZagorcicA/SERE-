/**
 * CSS animation helpers — pure DOM utilities, no dependencies.
 */

export function animateDeal(container: HTMLElement): Promise<void> {
  container.classList.add('dealing');
  return new Promise(resolve => {
    setTimeout(() => {
      container.classList.remove('dealing');
      resolve();
    }, 600);
  });
}

export function animateReveal(cardEl: HTMLElement): Promise<void> {
  cardEl.classList.add('flip');
  return new Promise(resolve => {
    setTimeout(() => resolve(), 400);
  });
}

export function animatePickup(pileEl: HTMLElement, _targetEl: HTMLElement): Promise<void> {
  pileEl.classList.add('sweeping');
  return new Promise(resolve => {
    setTimeout(() => {
      pileEl.classList.remove('sweeping');
      resolve();
    }, 500);
  });
}

export function shake(el: HTMLElement): void {
  el.classList.remove('shake');
  // Force reflow so re-adding the class triggers the animation again.
  void el.offsetWidth;
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 400);
}
