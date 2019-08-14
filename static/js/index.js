let Keyboard = window.SimpleKeyboard.default;

loadSnippets(S);
initText("de");

fsm.setup();
fsm.update("start");

idle.callback = () => fsm.update("start");

let CAT = "";
let IMG = "";
let IMG_TXT = "";
let EMAIL = "";
let ID = "";
