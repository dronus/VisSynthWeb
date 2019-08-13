loadSnippets(S);
initText("de");

fsm.setup();
fsm.update("category");

idle.callback = () => fsm.update("start");

let CAT = "";
let IMG = "";
let ID = "";

let put = (img, id) => {
  let url = "save";
  let json = JSON.stringify({"dataurl": img, "id": id});
  let xhr = new XMLHttpRequest();

  xhr.open("POST", url, true);
  xhr.setRequestHeader("Content-type","application/json; charset=utf-8");
  xhr.send(json);
};

let pronid = () => {
  let template = "cvcvnnnn".split("");
  let chars = {}
  chars.v = "aeiouy";
  chars.c = "bcdfghjklmnprstvwxz";
  chars.n = "0123456789";

  let pw = "";
  template.forEach(t => {
    let pool = chars[t];
    let randi = Math.floor(Math.random() * pool.length);
    pw += pool.charAt(randi);
  });

  return pw;
}
