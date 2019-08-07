let idle = {

  callback: () => console.warn("Please set idle.callback"),
  seconds: 60,

  start: function(verbose) {
    if (verbose) console.log("Idle start");
    if (this.timeoutID) window.clearTimeout(this.timeoutID);

    this.timeoutID = window.setTimeout(() => {
      if (verbose) console.log("Idle callback");
      this.callback();
    }, this.seconds * 1000);
  },

  stop: function(verbose) {
    if (verbose) console.log("Idle stop");
    window.clearTimeout(this.timeoutID);
  },
};
