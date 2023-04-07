let createSnippet = (text, lang, target) => {
  let el = document.createElement("span");
  el.classList.add(lang);
  el.dataset.text = text;
  return target.appendChild(el);
}

export let loadSnippets = (list) => {
  list.forEach((s) => {
    let targets = document.querySelectorAll(s.selector);

    targets.forEach((t) => {
      t.classList.add("s");
      createSnippet(s.text, s.lang, t);
    });
  });
};
