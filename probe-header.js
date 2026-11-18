(function () {
  var vw = window.innerWidth, vh = window.innerHeight;
  var out = [];
  var all = document.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    var r = e.getBoundingClientRect();
    if (r.width > 30 && r.top < vh * 0.13 && r.left > vw * 0.55) {
      out.push(e.tagName + '|cls=' + String(e.className || '').slice(0, 34) + '|txt=' + String(e.textContent || '').trim().slice(0, 16) + '|' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      if (out.length > 24) break;
    }
  }
  return out.join(' ;; ');
})()