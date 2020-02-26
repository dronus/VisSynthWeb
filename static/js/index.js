let Keyboard = window.SimpleKeyboard.default;

loadSnippets(S);
initText("de");

fsm.setup();
fsm.update("start");

idle.seconds = 120;
idle.callback = () => fsm.update("start");
