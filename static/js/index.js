
import {loadSnippets} from '../lib/snippet.js';
import {initText} from '../lib/lang.js';
import {fsm} from '../lib/fsm.js';
import {S} from '../js/index.txt.js';
import '../js/index.fsm.js';
import * as idle from '../lib/idle.js';

loadSnippets(S);
initText("de");

fsm.setup();
fsm.update("start");

window.fsm=fsm;

idle.init({seconds: 120, callback: () => fsm.update("start")});

