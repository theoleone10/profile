// "Copy email" buttons: <button data-copy="…">, announced through [data-copy-status].
export function initCopy(root = document) {
  const status = root.querySelector('[data-copy-status]');
  for (const button of root.querySelectorAll('[data-copy]')) {
    const label = button.textContent;
    let timer;
    button.addEventListener('click', async () => {
      const text = button.dataset.copy;
      try {
        await navigator.clipboard.writeText(text);
        button.textContent = 'Copied';
        status.textContent = `${text} copied`;
      } catch {
        button.textContent = text;
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        button.textContent = label;
        status.textContent = '';
      }, 2000);
    });
  }
}
