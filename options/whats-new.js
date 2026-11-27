// "What's new" dialog of the settings page. Reads CHANGELOG.md (the single source of truth,
// shipped with the extension) and renders the released versions. Opened by the header button,
// or automatically when the page is opened with #whats-new (link in the popup after an update).

(() => {
  const dialog = document.getElementById('whatsNew');
  const content = document.getElementById('changelog');
  let loaded = false;

  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Inline Markdown used in the changelog: `code`, **bold** and [links](https://...).
  function inline(text) {
    return escape(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  // Splits the changelog into versions: [{ version, date, sections: [{ title, items }] }].
  // The "Unreleased" section is skipped: it lists changes not shipped yet.
  function parse(markdown) {
    const versions = [];
    let version = null;
    let section = null;
    for (const line of markdown.split('\n')) {
      const v = /^## \[([^\]]+)\](?:\s*-\s*(.+))?/.exec(line);
      if (v) {
        version = v[1] === 'Unreleased' ? null : { version: v[1], date: (v[2] || '').trim(), sections: [] };
        if (version) versions.push(version);
        section = null;
        continue;
      }
      if (!version) continue;
      const h = /^### (.+)/.exec(line);
      if (h) {
        section = { title: h[1].trim(), items: [] };
        version.sections.push(section);
        continue;
      }
      const item = /^- (.+)/.exec(line);
      if (item && section) section.items.push(item[1]);
      else if (/^\s+\S/.test(line) && section && section.items.length)
        section.items[section.items.length - 1] += ' ' + line.trim();
    }
    return versions;
  }

  function render(versions) {
    const current = chrome.runtime.getManifest().version;
    content.innerHTML = versions
      .map((v, i) => {
        const body = v.sections
          .map((s) => `<h4>${escape(s.title)}</h4><ul>${s.items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`)
          .join('');
        const label = `Version ${escape(v.version)}${v.version === current ? ' <span class="tag">installed</span>' : ''}`;
        const date = v.date ? `<span class="date">${escape(v.date)}</span>` : '';
        // The latest version is open, older ones are collapsed.
        return `<details${i === 0 ? ' open' : ''}><summary><span>${label}</span>${date}</summary>${body}</details>`;
      })
      .join('');
  }

  async function open() {
    if (!loaded) {
      try {
        const markdown = await (await fetch(chrome.runtime.getURL('CHANGELOG.md'))).text();
        render(parse(markdown));
        loaded = true;
      } catch (e) {
        content.textContent = 'Could not load the changelog.';
      }
    }
    if (!dialog.open) dialog.showModal();
    // The popup's "updated" notice has done its job.
    chrome.storage.local.remove('whatsNew');
  }

  document.getElementById('whatsNewBtn').addEventListener('click', open);
  document.getElementById('whatsNewClose').addEventListener('click', () => dialog.close());
  // Click on the backdrop closes the dialog.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  if (location.hash === '#whats-new') open();
})();
