let fsm = {

  setup: function() {
    for (const [name, state] of Object.entries(this.states)) {
      if (state.stages) {
        state.stages.forEach(sname => {
          fsm.states[sname] = {};
          fsm.states[sname].__proto__ = state;
          fsm.states[sname].stage = document.querySelector(".stage." + sname);
          fsm.states[sname].stage.classList.add("hidden");
          fsm.states[sname].init();
        });

        continue;
      }

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
