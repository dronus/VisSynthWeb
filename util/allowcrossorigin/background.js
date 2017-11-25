
chrome.webRequest.onHeadersReceived.addListener(
  function(info) {
    var headers=info.responseHeaders;
    headers.push({name:'Access-Control-Allow-Origin',value:'*'});
    return {responseHeaders: headers};
  },
  // filters
  {
    urls: [
      "*://*/*"
    ]
  },
  // extraInfoSpec
  ["blocking","responseHeaders"]);
