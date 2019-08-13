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
      let thm = Math.floor(Math.random() * 6);
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
        chains[2][1].url = `static/themes/${CAT}/${i}.jpg`;
        this.preview.style.backgroundImage = `url(static/themes/${CAT}/${i}.jpg)`;
        this.thumbs.forEach(n => n.classList.remove("active"));
        ev.target.classList.add("active");
      }));

      this.prev.addEventListener("click", ev => fsm.update("category"));
      this.next.addEventListener("click", ev => fsm.update("countdown"));
    },

    up: function() {
      chains[2][1].url = `static/themes/${CAT}/0.jpg`;
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

    down: function() {
      this.shutter.classList.remove("close");
    },

    scrot: function() {
      this.shutter.classList.add("close");
      setTimeout(() => {
        screenshot();
      }, 200);
    },
  },

  "preview": {
    init: function() {
      this.prev = this.stage.querySelector(".prev");
      this.retry = this.stage.querySelector(".retry");
      this.next = this.stage.querySelector(".next");
      this.shutter = this.stage.querySelector(".shutter");

      this.prev.addEventListener("click", ev => fsm.update("theme"));
      this.retry.addEventListener("click", ev => fsm.update("countdown"));
      this.next.addEventListener("click", ev => fsm.update("message"));
    },

    up: function() {
      this.stage.style.backgroundImage = `url(${IMG})`;
      this.shutter.classList.add("open");
      setTimeout(this.shutter.classList.add("hidden"), 100);
    },

    down: function() {},
  },

  "message": {
    init: function() {
      this.input = this.stage.querySelector(".input");
      this.canvas = this.stage.querySelector(".canvas");
      this.ctx = this.canvas.getContext("2d");
      this.ctx.font = "100px Veneer";
      this.ctx.fillStyle = "#0072bb";
      this.text = {
        left: 350,
        top: 250,
        cmax: 25,
      };

      this.kb = new Keyboard(".message .kb", {
        theme: "simple-keyboard hg-theme-default hg-layout-default",
        onChange: input => this.onChange(input),
        layout: {'default': [
          "` 1 2 3 4 5 6 7 8 9 0 - = {bksp}",
          "q w e r t y u i o p [ ] \\",
          "a s d f g h j k l ; '",
          "z x c v b n m , . /",
          "{space}"
        ]},
      });

      this.prev = this.stage.querySelector(".prev");
      this.reset = this.stage.querySelector(".reset");
      this.next = this.stage.querySelector(".next");

      this.prev.addEventListener("click", ev => fsm.update("theme"));
      this.reset.addEventListener("click", ev => fsm.update("start"));
      this.next.addEventListener("click", ev => {
        IMG_TXT = this.canvas.toDataURL("image/jpeg");
        fsm.update("send");
      });
    },

    up: function() {
      this.img = new Image;
      this.img.src = IMG;
      this.img.onload = () => this.ctx.drawImage(this.img, 0, 0);
    },

    down: function() {
      this.kb.setInput("");
      this.input.value = "";
    },

    onChange: function(input) {
      if (input.length === this.text.cmax + 1) {
        input = input.substring(0, this.text.cmax);
        this.kb.setInput(input);
      }

      this.input.value = input;
      this.ctx.drawImage(this.img, 0, 0);
      this.ctx.save();
      this.ctx.rotate(-4.5 * Math.PI / 180);
      this.ctx.fillText(input, this.text.left, this.text.top);
      this.ctx.restore();
    },
  },

  "send": {
    init: function() {
      this.preview = this.stage.querySelector(".preview");
      this.input = this.stage.querySelector(".input");
      this.ctx = this.stage.querySelector(".canvas").getContext("2d");
      this.cmax = 25;

      this.kb = new Keyboard(".send .kb", {
        theme: "simple-keyboard hg-theme-default hg-layout-default",
        onChange: input => this.onChange(input),
        layout: {'default': [
          "` 1 2 3 4 5 6 7 8 9 0 - = {bksp}",
          "q w e r t y u i o p [ ] \\",
          "a s d f g h j k l ; '",
          "z x c v b n m , . /",
          "{space}"
        ]},
      });

      this.prev = this.stage.querySelector(".prev");
      this.reset = this.stage.querySelector(".reset");
      this.next = this.stage.querySelector(".next");

      this.prev.addEventListener("click", ev => fsm.update("message"));
      this.reset.addEventListener("click", ev => fsm.update("start"));
      this.next.addEventListener("click", ev => fsm.update("send"));
    },

    up: function() {
      this.img = new Image;
      this.img.src = IMG_TXT;
      this.img.onload = () => this.ctx.drawImage(this.img, 0, 0);
    },

    down: function() {
      this.img = new Image;
      this.img.src = IMG;
      this.img.onload = () => this.ctx.drawImage(this.img, 0, 0);
    },

    onChange: function(input) {
      if (input.length === this.cmax + 1) {
        input = input.substring(0, this.cmax);
        this.kb.setInput(input);
      }

      this.input.value = input;
    },
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
