fsm.states = {

  "start": {
    init: function() {
      this.button = this.stage.querySelector(".button");
      this.button.addEventListener("click", ev => fsm.update("category"));

      this.cats = [];
      document.querySelectorAll(".stage.category .cat")
        .forEach(n => this.cats.push(n.dataset.id));
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
      this.stage.querySelectorAll(".cat").forEach(c => {
        c.addEventListener("click", ev =>
          fsm.update(`theme__${c.dataset.id}`));
        fsm.states.theme.stages.push(`theme__${c.dataset.id}`);
      });
    },
    up: function() {},
    down: function() {},
  },

  "theme": {
    stages: [],

    init: function() {
      this.preview = this.stage.querySelector(".preview");
      this.thumbs = this.stage.querySelectorAll(".thumb");
      this.prev = this.stage.querySelector(".prev");
      this.next = this.stage.querySelector(".next");
      this.cat = this.stage.querySelector(".instruction .cat");

      this.thumbs.forEach((node, i) => node.addEventListener("click", ev => {
        THM = i;
        chains[2][1].url = `static/themes/${this.stage.dataset.id}/${i}.jpg`;
        this.preview.style.backgroundImage = `url(static/themes/${this.stage.dataset.id}/${i}.jpg)`;
        this.thumbs.forEach(n => n.classList.remove("active"));
        ev.target.classList.add("active");
      }));

      this.prev.addEventListener("click", ev => fsm.update("category"));
      this.next.addEventListener("click", ev => fsm.update("countdown"));
    },

    up: function() {
      chains[2][1].url = `static/themes/${this.stage.dataset.id}/0.jpg`;
      this.preview.style.backgroundImage = `url(static/themes/${this.stage.dataset.id}/0.jpg)`;
      this.thumbs.forEach((n, i) => {
        if (i === 0) n.classList.add("active");
        n.style.backgroundImage = `url(static/themes/${this.stage.dataset.id}/${i}.jpg)`;
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
      }, 50);
    },
  },

  "preview": {
    init: function() {
      this.prev = this.stage.querySelector(".prev");
      this.retry = this.stage.querySelector(".retry");
      this.next = this.stage.querySelector(".next");

      this.prev.addEventListener("click", ev => fsm.update("theme"));
      this.retry.addEventListener("click", ev => fsm.update("countdown"));
      this.next.addEventListener("click", ev => fsm.update("message"));
    },

    up: function() {
      this.stage.style.backgroundImage = `url(${IMG})`;
    },

    down: function() {},
  },

  "message": {
    init: function() {
      this.preview = this.stage.querySelector(".preview");
      this.canvas = this.stage.querySelector(".canvas");
      this.ctx = this.canvas.getContext("2d");
      this.ctx.textBaseline = "top";
      this.ctx.font = "85px Veneer";

      this.text = {
        left: 350,
        top: 250,
        wmax: 750,
        height: 80,
      };

      this.preview.addEventListener("touchstart", ev => {
        // https://docs.google.com/document/d/1sfUup3nsJG3zJTf0YR0s2C5vgFTYEmfEqZs01VVj8tE/edit#heading=h.kwu02aavwrcu
        // keep event flow stable; workaround
        ev.preventDefault();
      });

      this.preview.addEventListener("touchmove", ev => {
        this.text.left = (ev.touches[0].clientX - this.huge.x) / this.huge.width * 1920;
        this.text.top = (ev.touches[0].clientY - this.huge.y) / this.huge.height * 1080;
        this.redraw(this.kb.getInput());
      });

      this.kb = new Keyboard(".message .kb", {
        theme: "simple-keyboard hg-theme-default hg-layout-default",
        onChange: input => this.redraw(input),
        layout: {'default': [
          "1 2 3 4 5 6 7 8 9 0 {bksp}",
          "q w e r t y u i o p ü *",
          "a s d f g h j k l ö ä #",
          "! ? z x c v b n m . , -",
          "' \" {space} ( )"
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

      this.box = new Image;
      this.box.src = "static/svg/message.svg";

      this.small = this.preview.getBoundingClientRect();
      this.huge = this.canvas.getBoundingClientRect();
    },

    down: function() {
      this.kb.setInput("");
    },

    redraw: function(input) {
      let [lines, overflow] = this.multiline(input);
      if (overflow) this.kb.setInput(input.slice(0, -1));

      this.ctx.drawImage(this.img, 0, 0);
      this.ctx.save();
      this.ctx.rotate(-4.5 * Math.PI / 180);
      this.ctx.globalAlpha = 0.8;
      this.ctx.drawImage(this.box, this.text.left - 50, this.text.top - 50, this.longest(lines) + 100, this.text.height * lines.length + 100);
      this.ctx.globalAlpha = 1;
      this.ctx.fillStyle = "#0072bb";
      lines.forEach((l, i) => {
        this.ctx.fillText(l, this.text.left, this.text.top + this.text.height * i)
      });
      this.ctx.restore();
    },

    width: function(str) {
      let result = 0;
      str.split("").forEach(n => result += wchars.get(n));
      return result;
    },

    longest: function(array) {
      let n = 0;
      array.forEach(str => {
        w = this.width(str);
        if (w > n) n = w;
      });
      return n;
    },

    multiline: function(str) {
      let result = [];
      let line = "";
      let eol = 0;

      for (var i = 0; i < str.length; i++) {
        if (this.width(line) > this.text.wmax && result.length === 2) {
          result.push(line);
          return [result, true];
        }

        if (this.width(line) > this.text.wmax)
          eol = line.lastIndexOf(" ");

        if (eol === -1) {
          result.push(line);
          return [result, true];
        }

        if (eol > 0) {
          result.push(line.slice(0, eol));
          line = line.slice(eol + 1);
          eol = 0;
        }

        line += str.charAt(i);
      }

      result.push(line);
      return [result, false];
    },
  },

  "send": {
    init: function() {
      this.preview = this.stage.querySelector(".preview");
      this.input = this.stage.querySelector(".input");
      this.invalid = this.stage.querySelector(".invalid");
      this.ctx = this.stage.querySelector(".canvas").getContext("2d");
      this.cmax = 32;
      this.regex = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

      this.kb = new Keyboard(".send .kb", {
        theme: "simple-keyboard hg-theme-default hg-layout-default",
        onChange: input => this.redraw(input),
        layout: {'default': [
          "1 2 3 4 5 6 7 8 9 0 {bksp}",
          "q w e r t y u i o p",
          "a s d f g h j k l",
          "@ z x c v b n m - _ .",
          ".org .net {space} .de .com"
        ]},
      });

      this.prev = this.stage.querySelector(".prev");
      this.reset = this.stage.querySelector(".reset");
      this.next = this.stage.querySelector(".next");

      this.prev.addEventListener("click", ev => fsm.update("message"));
      this.reset.addEventListener("click", ev => fsm.update("start"));
      this.next.addEventListener("click", ev => {
        if (this.regex.test(this.input.value.toLowerCase())) {
          EMAIL = this.input.value.toLowerCase();
          return fsm.update("end");
        }
        this.invalid.classList.remove("hidden");
      });

      this.invalid.classList.add("hidden");
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

      this.invalid.classList.add("hidden");
      this.kb.setInput("");
      this.input.value = "";
    },

    redraw: function(input) {
      if (input.length >= this.cmax + 1) {
        input = input.substring(0, this.cmax);
        this.kb.setInput(input);
      }

      this.input.value = input;
    },
  },

  "end": {
    init: function() {
      this.wait = this.stage.querySelector(".wait");
      this.done = this.stage.querySelector(".done");
      this.info = this.stage.querySelector(".info");
      this.reset = this.stage.querySelector(".reset");
      this.flaps = this.stage.querySelectorAll(".flap");
      this.delay = 1000;

      this.done.classList.add("hidden");
      this.info.classList.add("hidden");
      this.reset.classList.add("hidden");
      this.reset.addEventListener("click", ev => fsm.update("start"));
      this.flaps.forEach(n => n.classList.add("hidden"));
    },

    up: function() {
      this.put(this.pronid(), EMAIL, IMG_TXT);

      for (let i = 0; i < this.flaps.length; i++) {
        setTimeout(() => {
          this.flaps.forEach(n => n.classList.add("hidden"));
          this.flaps[i].classList.remove("hidden");
        }, i * this.delay);
      }

      setTimeout(() => {
        this.wait.classList.add("hidden");
        this.done.classList.remove("hidden");
        this.info.classList.remove("hidden");
        this.reset.classList.remove("hidden");
      }, this.flaps.length * this.delay);
    },

    down: function() {
      this.wait.classList.remove("hidden");
      this.done.classList.add("hidden");
      this.info.classList.add("hidden");
      this.reset.classList.add("hidden");
      this.flaps.forEach(n => n.classList.add("hidden"));
    },

    put: function(id, email, img) {
      let url = "save";
      let json = JSON.stringify({"id": id, "email": email, "img": img});
      let xhr = new XMLHttpRequest();

      xhr.open("POST", url, true);
      xhr.setRequestHeader("Content-type","application/json; charset=utf-8");
      xhr.send(json);

      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) console.log("data written");
      };
    },

    pronid: function() {
      let template = "cvcvnnnn".split("");
      let chars = {};
      chars.v = "aeiouy";
      chars.c = "bcdfghjklmnprstvwxz";
      chars.n = "0123456789";

      let str = "";
      template.forEach(t => {
        let pool = chars[t];
        let randi = Math.floor(Math.random() * pool.length);
        str += pool.charAt(randi);
      });

      return str;
    },
  },

};
