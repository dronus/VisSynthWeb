fsm.states = {

  "start": {
    init: function() {
      this.button = this.stage.querySelector(".button");
      this.button.addEventListener("click", ev => fsm.update("category"));

      this.cats = [];
      document.querySelectorAll(".stage.category .cat")
        .forEach(n => this.cats.push(n.dataset.cat));
    },

    up: function() {
      let cat = this.cats[Math.floor(Math.random() * this.cats.length)];
      let thm = Math.floor(Math.random() * 7);
      chains[2][1].url = `static/themes/${cat}/${thm}.jpg`;
    },

    down: function() {},
  },

  "category": {
    init: function() {
      this.buttons = this.stage.querySelectorAll(".cat");
      this.buttons.forEach(n => n.addEventListener("click", ev => {
        CAT = ev.target.dataset.cat;
        fsm.update("theme");
      }));
    },

    up: function() {},
    down: function() {},
  },

  "theme": {
    init: function() {
      this.preview = this.stage.querySelector(".preview");
      this.thumbs = this.stage.querySelectorAll(".thumb");
      this.prev = this.stage.querySelector(".prev");
      this.next = this.stage.querySelector(".next");

      this.thumbs.forEach((node, i) => node.addEventListener("click", ev => {
        THM = i;
        this.preview.style.backgroundImage = `url(static/themes/${CAT}/${i}.jpg)`;
        chains[2][1].url = `static/themes/${CAT}/${i}.jpg`;
        this.thumbs.forEach(n => n.classList.remove("active"));
        ev.target.classList.add("active");
      }));

      this.prev.addEventListener("click", ev => fsm.update("category"));
      this.next.addEventListener("click", ev => fsm.update("countdown"));
    },

    up: function() {
      this.preview.style.backgroundImage = `url(static/themes/${CAT}/0.jpg)`;
      this.thumbs.forEach((n, i) => {
        if (i === 0) n.classList.add("active");
        n.style.backgroundImage = `url(static/themes/${CAT}/${i}.jpg)`;
      });
    },

    down: function() {
      this.thumbs.forEach(n => n.classList.remove("active"));
    },
  },

  "countdown": {
    init: function() {
      this.shutter = this.stage.querySelector(".shutter");
      this.flaps = this.stage.querySelectorAll(".flap");
      this.flaps.forEach(n => n.classList.add("hidden"));
      this.delay = 1000;
    },

    up: function() {
      for (let i = 0; i < this.flaps.length; i++) {
        setTimeout(() => {
          this.flaps.forEach(n => n.classList.add("hidden"));
          this.flaps[i].classList.remove("hidden");
        }, i * this.delay);
      }

      setTimeout(() => this.scrot(), this.flaps.length * this.delay);
    },

    down: function() {},

    scrot: function() {
      this.shutter.classList.add("dark");
      setTimeout(() => fsm.update("preview"), 200);
    },
  },

  "preview": {
    init: function() {},
    up: function() {},
    down: function() {},
  },

  "message": {
    init: function() {},
    up: function() {},
    down: function() {},
  },

  "send": {
    init: function() {},
    up: function() {},
    down: function() {},
  },

  "end": {
    init: function() {
      this.handler = this.handler.bind(this);
    },

    up: function() {
      this.stage.addEventListener("click", this.handler);
    },

    down: function() {
      this.stage.removeEventListener("click", this.handler);
    },

    handler: function() {
      console.log(this.stage);
      fsm.update("foo");
    },
  },

};
