let fsm = {

  setup: function() {
    this.protos.forEach((p, names) => names.forEach(s => {
      this.states[s] = Object.create(p);
    }));

    for (const [name, state] of Object.entries(this.states)) {
      state.stage = document.querySelector(".stage." + name);
      state.stage.classList.add("hidden");
      state.init();
    }
  },

  update: function(name) {
    let current = this.states[this.active];
    let target = this.states[name];

    if (current) {
      current.stage.classList.add("hidden");
      current.down();
    }

    target.stage.classList.remove("hidden");
    target.up();

    this.active = name;
  },

};
