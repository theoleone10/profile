// "More about…" buttons: <button data-open="id"> opens <dialog id="id">. The
// dialog closes with its × button, Escape, or a click on the dimmed page.
export function initMore(root = document) {
  root.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    if (opener) {
      document.getElementById(opener.dataset.open)?.showModal();
      return;
    }
    const close = e.target.closest('.more-close');
    if (close) {
      close.closest('dialog')?.close();
      return;
    }
    // a click on the backdrop lands on the dialog itself, outside its box
    if (e.target instanceof HTMLDialogElement && e.target.open) {
      const r = e.target.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) e.target.close();
    }
  });
}
