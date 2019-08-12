let langs = (callback) => {
  callback(["de"]);
};

let fallback = (s) => {
  let lang = sessionStorage.getItem("langDefault");
  let el = s.querySelector("." + lang);

  if (!el) {
    console.warn("Text not available");
    let fallback = document.createElement("mark");
    fallback.innerText = "N/A";
    s.querySelector(":first-child").appendChild(fallback);
    return;
  }

  let fallback = document.createElement("s");
  fallback.innerText = el.dataset.text;
  el.appendChild(fallback);
};

let updateText = (code) => {
  if (!code) return;

  document.querySelectorAll(".s").forEach((s) => {
    let langFound = false;

    for (let i = 0; i < s.children.length; i++) {
      let el = s.children[i];
      if (el.classList.contains(code)) {
        el.innerHTML = el.dataset.text;
        langFound = true;
      } else {
        el.innerHTML = "";
      }
    }

    if (!langFound) {
      fallback(s);
    }
  });
};

let initText = (store) => {
  let lang = sessionStorage.getItem(store);
  updateText(lang);

  if (!lang) {
    langs(list => {
      sessionStorage.setItem("langDefault", list[0]);
      sessionStorage.setItem(store, list[0]);
      updateText(list[0]);
    });
  }
};

let initControls = (storage) => {
  let target = document.querySelector("ul.lang");

  langs(list => {
    if (list.length === 1) return;

    list.forEach((l) => {
      let el = document.createElement("li");
      el.dataset.code = l;
      el.innerText = l;
      target.appendChild(el);
    });
  });

  target.addEventListener("click", (ev) => {
    ev.preventDefault();
    sessionStorage.setItem(storage, ev.target.dataset.code);
    updateText(ev.target.dataset.code);
  });
}
