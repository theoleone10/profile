// The small pipeline above a demo. It fills in as you read past the three
// points beside it, and lights the stage that just ran when you use the demo.
export function initFlow(demo) {
  const flow = demo.querySelector('.flow');
  if (!flow) return { step() {} };
  const stages = [...flow.children];
  const points = [...(demo.closest('.hour')?.querySelectorAll('.points li') ?? [])];
  let read = 0; // how far scrolling has got
  let used = 0; // how far the demo has got

  function paint() {
    const lit = Math.max(read, used);
    stages.forEach((s, i) => s.toggleAttribute('data-lit', i < lit));
  }

  if (points.length) {
    const observer = new IntersectionObserver(() => {
      const passed = points.filter((p) => p.getBoundingClientRect().top < innerHeight * 0.7).length;
      points.forEach((p, i) => p.toggleAttribute('data-current', i === passed - 1));
      read = Math.ceil((passed / points.length) * stages.length);
      paint();
    }, { rootMargin: '0px 0px -30% 0px', threshold: [0, 1] });
    for (const point of points) observer.observe(point);
  }

  return {
    step(name) {
      const i = stages.findIndex((s) => s.dataset.stage === name);
      if (i < 0) return;
      used = Math.max(used, i + 1);
      paint();
      for (const s of stages) s.removeAttribute('data-now');
      void stages[i].offsetWidth; // restart the pulse if it's the same stage again
      stages[i].setAttribute('data-now', '');
    },
  };
}
