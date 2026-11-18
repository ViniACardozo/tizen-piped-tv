(async () => {
  var id = 'qvpvQTi_An0';
  var hs = ['pipedapi.kavin.rocks','pipedapi.adminforge.de','pipedapi.ducks.party','pipedapi.wireway.ch','api.piped.private.coffee','pipedapi.rivo.lol','pipedapi.drgns.space','pipedapi.artemislena.eu','pipedapi.projectsegfau.lt','pipedapi.privacydev.net','pipedapi.leptons.xyz','pipedapi.nosebs.ru','pipedapi.orangenet.cc','pipedapi.darkness.services'];
  var out = [];
  await Promise.all(hs.map(function (h) {
    return (async function () {
      try {
        var c = new AbortController();
        var t = setTimeout(function () { c.abort(); }, 9000);
        var r = await fetch('https://' + h + '/streams/' + id, { mode: 'cors', signal: c.signal });
        clearTimeout(t);
        var s = 'naojson';
        try {
          var j = await r.json();
          s = (j.videoStreams ? j.videoStreams.length : 0) + '/hls' + (j.hls ? 1 : 0);
        } catch (e) {}
        out.push(h + '=' + r.status + ':' + s);
      } catch (e) {
        out.push(h + '=' + String(e.name || e.message).slice(0, 12));
      }
    })();
  }));
  return out.join(' | ');
})()