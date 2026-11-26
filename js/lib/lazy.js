// Run something once, when an element is about to scroll into view.
export function whenNear(element, run, rootMargin = '600px 0px') {
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();
    run();
  }, { rootMargin });
  observer.observe(element);
}
