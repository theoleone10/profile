// The phones in the demo cards are drawn at one size, like main's, and scaled
// down to fit whatever room their card has.
export function fitDevices(root = document) {
  for (const stage of root.querySelectorAll('.device-stage')) {
    const device = stage.querySelector('.device');
    const fit = () => {
      const room = stage.clientHeight - 34;
      if (room <= 0) return;
      device.style.zoom = Math.min(1, room / 640, (stage.clientWidth - 8) / 300).toFixed(3);
    };
    new ResizeObserver(fit).observe(stage);
  }
}
