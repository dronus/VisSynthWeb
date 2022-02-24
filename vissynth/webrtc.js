
export async function WebRTC(server_url, path, source_el, target_el, close_listener,callImmediately) {

  var websocket;
  var open_socket=function()
  {
    websocket=new WebSocket(server_url ? server_url : (document.location.protocol=='https:'?'wss:':'ws:')+'//'+document.location.hostname+':'+document.location.port+document.location.pathname.replace('index.html',''));
    websocket.onopen=function(){
      // opt in for webrtc 
      websocket.send(JSON.stringify({'method':'get', 'path':path, 'data':''}));
      if(target_el || callImmediately) webrtc.call();
    };
    websocket.onerror=function()
    {
      setTimeout(open_socket,1000);
    }
  }
  open_socket();

  var put=function(data){
    if(websocket.readyState)
      websocket.send(JSON.stringify({'method':'put', 'path':path, 'data':data}));
  }  
  
  
  let pc = new RTCPeerConnection({});
  
  let dc=null;

  if(callImmediately) {
    dc=pc.createDataChannel("");
    if(close_listener) dc.onclose=close_listener;
  }

  pc.ondatachannel=(e)=>{
    if(dc) throw("WebRTC: DataChannel from remote, but we already have a DataChannel!");
    dc=e.channel;
    if(close_listener) dc.onclose=close_listener;
  }
  
  pc.addEventListener('icecandidate', e => {
    if(e.candidate != null) put(JSON.stringify({"type": "new-ice-candidate", "candidate": e.candidate}));
    console.log(`ICE candidate:\n${e.candidate ? e.candidate.candidate : '(null)'}`);
  });
  pc.addEventListener('iceconnectionstatechange', e => {
    if (pc) console.log(`ICE state change: ${pc.iceConnectionState}`);
  });

  let localStream;
  if(source_el && source_el.srcObject===null) {
    localStream = await navigator.mediaDevices.getUserMedia({audio: true, video: true});
    source_el.srcObject = localStream;
  } else if (source_el && source_el.captureStream) {
    localStream=source_el.captureStream();
  }
  if(localStream) {
    const videoTracks = localStream.getVideoTracks();
    const audioTracks = localStream.getAudioTracks();
    if (videoTracks.length > 0) {
      console.log(`Using video device: ${videoTracks[0].label}`);
    }
    if (audioTracks.length > 0) {
      console.log(`Using audio device: ${audioTracks[0].label}`);
    }

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
  }
  
  pc.addEventListener('track', e => {
    if (target_el && target_el.srcObject !== e.streams[0]) {
      target_el.srcObject = e.streams[0];
      target_el.play();
      if(close_listener)
        e.streams[0].getVideoTracks()[0].onended=close_listener;
      console.log('pc received remote stream');
    }
  });
  
  // opt-in for command feed from remote control server
  websocket.onmessage=async function(event)
  {
    var packet=JSON.parse(event.data.text ? await event.data.text() : event.data);
    var path=packet.path, message=packet.data;

    var msg=JSON.parse(message);
    // TODO handle offer, answer,  ICE
    if(msg.type=="offer"){
      console.log(`incoming offer:${msg.sdp}`);
      await pc.setRemoteDescription(msg);
      const answer = await pc.createAnswer();
      console.log(`createAnswer:\n${answer.sdp}`);
      await pc.setLocalDescription(answer);
      put(JSON.stringify(answer));
    }
    if(msg.type=="answer"){
      console.log(`incoming answer ${msg.sdp}`);
      await pc.setRemoteDescription(msg);
    }
    if(msg.type=="new-ice-candidate"){
      console.log(`addIceCandidate ${msg.candidate}`);
      await pc.addIceCandidate(msg.candidate);
    }
  }

  let webrtc={};

  webrtc.hangup=function() {
    pc.close();
    pc = null;
    websocket.close();
  }

  webrtc.call=async function() {
    let tx = pc.addTransceiver('video',{'direction':'recvonly'});
    // prefer H.264 codecs (VP8 and VP9 consume more cpu, increasing latency)
    // let codecs = RTCRtpReceiver.getCapabilities('video').codecs;
    // codecs = codecs.filter(codec => codec.mimeType == 'video/H264');
    // tx.setCodecPreferences(codecs);
    const offer = await pc.createOffer();
    console.log(`createOffer:\n${offer.sdp}`);
    await pc.setLocalDescription(offer);
    put(JSON.stringify(offer));
  }

  webrtc.send             = (msg) => dc.send(msg);
  webrtc.addEventListener = (l, opts) => dc.addEventListener(l, opts);

  return webrtc;
}

