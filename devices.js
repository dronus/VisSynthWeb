// manages a list available capture devices, grouped by type (audio, video)

export let devices = new EventTarget();
devices.audio=[]; devices.video=[];
devices.update=async function()
{

  devices.audio=[];
  devices.video=[];
  let sources = await navigator.mediaDevices.enumerateDevices();
  for (let source of sources) {
    var kind=source.kind.replace('input','');

    if(kind=='audio' || kind=='video')
      devices[kind].push(source);
  }
  devices.dispatchEvent(new Event("update"));
}

navigator.mediaDevices.ondevicechange=devices.update;
devices.update();
