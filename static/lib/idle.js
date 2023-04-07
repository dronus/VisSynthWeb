let callback, seconds, debug, timeoutID;

export let init = o => {
  callback = o.callback ?? (() => console.warn("Please set idle.callback"));
  seconds = o.seconds ?? 60;
  debug = o.debug ?? false;
};

export let start = () => {
  if (debug) console.log("Idle start");
  window.clearTimeout(timeoutID);

  timeoutID = window.setTimeout(() => {
    if (debug) console.log("Idle callback");
    callback();
  }, seconds * 1000);
};

export let stop = () => {
  if (debug) console.log("Idle stop");
  window.clearTimeout(timeoutID);
};
