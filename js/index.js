loadSnippets(S);
initText("de");

fsm.setup();
fsm.update("category");

idle.callback = () => fsm.update("start");

let CAT = "";
