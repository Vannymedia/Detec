(function(){
"use strict";
var $ = function(id){return document.getElementById(id)};

/* ---------- Matrix rain ---------- */
var cv = $("rain"), cx = cv.getContext("2d");
var glyphs = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF";
var cols = [], fs = 16, W = 0, H = 0;
function sizeRain(){
  W = cv.width = window.innerWidth; H = cv.height = window.innerHeight;
  cols = new Array(Math.ceil(W/fs)).fill(0).map(function(){return Math.random()*H/fs});
}
function drawRain(){
  cx.fillStyle = "rgba(5,10,7,.12)"; cx.fillRect(0,0,W,H);
  cx.fillStyle = "#00ff66"; cx.font = fs + "px monospace";
  for(var i=0;i<cols.length;i++){
    var ch = glyphs.charAt(Math.floor(Math.random()*glyphs.length));
    cx.fillText(ch, i*fs, cols[i]*fs);
    if(cols[i]*fs > H && Math.random() > .975) cols[i] = 0;
    cols[i]++;
  }
}
sizeRain(); window.addEventListener("resize", sizeRain);
if(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches){
  for(var k=0;k<30;k++) drawRain();
}else{
  setInterval(drawRain, 60);
}

/* ---------- Settings ---------- */
var store = {
  get:function(k){try{return localStorage.getItem(k)||""}catch(e){return ""}},
  set:function(k,v){try{localStorage.setItem(k,v)}catch(e){}}
};
var dlg = $("settings");
$("apiKey").value = store.get("mvd_key");
$("proxy").value = store.get("mvd_proxy");
$("model").value = store.get("mvd_model") || "claude-sonnet-5";
$("openSettings").onclick = function(){dlg.showModal()};
$("closeSettings").onclick = function(){dlg.close()};
$("saveSettings").onclick = function(){
  store.set("mvd_key",$("apiKey").value.trim());
  store.set("mvd_proxy",$("proxy").value.trim());
  store.set("mvd_model",$("model").value.trim() || "claude-sonnet-5");
  dlg.close();
};

/* ---------- Image intake ---------- */
var imgB64 = null, imgType = "image/jpeg";
var drop = $("drop"), fileIn = $("file"), camIn = $("cam");
drop.onclick = function(){fileIn.click()};
drop.onkeydown = function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();fileIn.click()}};
$("camBtn").onclick = function(){camIn.click()};
["dragenter","dragover"].forEach(function(t){drop.addEventListener(t,function(e){e.preventDefault();drop.classList.add("over")})});
["dragleave","drop"].forEach(function(t){drop.addEventListener(t,function(e){e.preventDefault();drop.classList.remove("over")})});
drop.addEventListener("drop",function(e){var f=e.dataTransfer.files[0];if(f)loadFile(f)});
fileIn.onchange = function(){if(fileIn.files[0])loadFile(fileIn.files[0])};
camIn.onchange = function(){if(camIn.files[0])loadFile(camIn.files[0])};

function loadFile(f){
  if(!/^image\//.test(f.type)){showError("That file is not an image. Choose a JPG, PNG, WebP or GIF.");return}
  var url = URL.createObjectURL(f), im = new Image();
  im.onload = function(){
    var max = 1568, s = Math.min(1, max/Math.max(im.width, im.height));
    var c = document.createElement("canvas");
    c.width = Math.round(im.width*s); c.height = Math.round(im.height*s);
    c.getContext("2d").drawImage(im,0,0,c.width,c.height);
    var data = c.toDataURL("image/jpeg",.85);
    imgB64 = data.split(",")[1]; imgType = "image/jpeg";
    $("preview").src = data;
    drop.classList.add("hidden"); $("scanBox").classList.remove("hidden");
    $("scanBtn").disabled = false; $("result").className = "result"; $("result").innerHTML = "";
    URL.revokeObjectURL(url);
  };
  im.onerror = function(){showError("This image could not be read. Try a different file.")};
  im.src = url;
}

/* ---------- Analysis ---------- */
var PROMPT = [
"You analyze a single image and report what can be verified from it.",
"Rules:",
"- Never identify a real person from their face or body. You may use a name only if it is printed in the image (caption, name tag, credits, subtitle).",
"- You may identify a movie, show, artwork, landmark, product or place from non-facial evidence: title text, logos, posters, distinctive sets, props, vehicles, architecture, signage, aspect and style.",
"- If the image is a film still with no such evidence, say the source cannot be determined and describe what a person could search for instead.",
"- Give an honest confidence from 0 to 100 that reflects the evidence. Do not inflate it. Use under 50 when you are guessing.",
"Respond with ONLY a JSON object, no markdown fences, with these keys:",
"best_match (string, the most likely title/place/subject or 'Unknown'),",
"kind (string, e.g. 'Film still', 'Landmark', 'Product', 'Artwork', 'Photo'),",
"confidence (integer 0-100),",
"evidence (array of short strings, what supports the match),",
"scene (string, 1-2 sentence description without naming people),",
"visible_text (array of strings read from the image),",
"objects (array of short strings),",
"alternatives (array of objects {name, confidence}),",
"search_queries (array of 3 short web search queries that would help verify or find the source),",
"caveats (string, what limits this result)."
].join("\n");

var stages = [
 ["READING IMAGE","Extracting visual details..."],
 ["DETECTING TEXT","Looking for titles, logos and signs..."],
 ["ANALYZING SCENE","Checking setting, objects and style..."],
 ["RANKING MATCHES","Comparing candidate sources..."]
];
var timer = null;

function setProgress(p, si){
  $("pbar").style.width = p + "%";
  $("ptext").textContent = Math.round(p) + "% COMPLETE";
  if(si!=null){$("stTitle").textContent = stages[si][0];$("stSub").textContent = stages[si][1]}
}
function startBusy(){
  $("stage").classList.add("busy"); $("frame").classList.add("scanning");
  $("scanBtn").disabled = true; $("camBtn").disabled = true;
  var p = 3; setProgress(p,0);
  timer = setInterval(function(){
    p = Math.min(92, p + (p<60 ? 4 : 1.2));
    setProgress(p, Math.min(3, Math.floor(p/25)));
  }, 400);
}
function stopBusy(){
  clearInterval(timer);
  $("frame").classList.remove("scanning");
  $("scanBtn").disabled = false; $("camBtn").disabled = false;
}

$("scanBtn").onclick = function(){
  if(!imgB64) return;
  var key = store.get("mvd_key"), proxy = store.get("mvd_proxy");
  if(!key && !proxy){dlg.showModal();return}
  startBusy();
  var body = {
    model: store.get("mvd_model") || "claude-sonnet-5",
    max_tokens: 1500,
    messages:[{role:"user",content:[
      {type:"image",source:{type:"base64",media_type:imgType,data:imgB64}},
      {type:"text",text:PROMPT}
    ]}]
  };
  var url = proxy || "https://api.anthropic.com/v1/messages";
  var headers = {"content-type":"application/json"};
  if(!proxy){
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  }
  fetch(url,{method:"POST",headers:headers,body:JSON.stringify(body)})
   .then(function(r){
     return r.json().then(function(j){
       if(!r.ok) throw new Error((j && j.error && j.error.message) || ("Request failed (" + r.status + ")"));
       return j;
     });
   })
   .then(function(j){
     var txt = (j.content||[]).filter(function(b){return b.type==="text"}).map(function(b){return b.text}).join("");
     var a = txt.indexOf("{"), b = txt.lastIndexOf("}");
     if(a<0||b<0) throw new Error("The engine returned an unreadable answer. Try again.");
     var data = JSON.parse(txt.slice(a,b+1));
     setProgress(100,3);
     setTimeout(function(){stopBusy();$("stage").classList.remove("busy");render(data)},450);
   })
   .catch(function(e){
     stopBusy();$("stage").classList.remove("busy");
     showError(e.message || "Something went wrong. Check your key or endpoint and try again.");
   });
};

/* ---------- Rendering ---------- */
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function list(a){return (a&&a.length)?'<ul class="plain">'+a.map(function(x){return "<li>"+esc(x)+"</li>"}).join("")+"</ul>":'<p class="note">Nothing found.</p>'}
function tags(a){return (a&&a.length)?'<div class="tags">'+a.map(function(x){return '<span class="tag">'+esc(x)+"</span>"}).join("")+"</div>":'<p class="note">None detected.</p>'}

function render(d){
  var c = Math.max(0, Math.min(100, parseInt(d.confidence,10) || 0));
  var cls = c>=75 ? "" : (c>=50 ? "mid" : "low");
  var lvl = c>=75 ? "Strong evidence" : (c>=50 ? "Partial evidence" : "Weak evidence");
  var alts = (d.alternatives||[]).map(function(a){return esc(a.name)+" ("+esc(a.confidence)+"%)"});
  var qs = (d.search_queries||[]).slice(0,3);
  var h = '';
  h += '<div class="card"><h2>BEST MATCH</h2><div class="best">'+esc(d.best_match||"Unknown")+'</div><div class="kind">'+esc(d.kind||"")+'</div>';
  h += '<div class="conf"><div class="conf-row"><span>'+lvl+'</span><span>'+c+'%</span></div><div class="bar '+cls+'"><i id="cbar"></i></div></div>';
  if(d.caveats) h += '<p class="note">'+esc(d.caveats)+'</p>';
  h += '</div>';
  if(d.scene) h += '<div class="card"><h2>SCENE</h2><p>'+esc(d.scene)+'</p></div>';
  h += '<div class="card"><h2>EVIDENCE</h2>'+list(d.evidence)+'</div>';
  h += '<div class="card"><h2>TEXT IN IMAGE</h2>'+tags(d.visible_text)+'</div>';
  h += '<div class="card"><h2>OBJECTS</h2>'+tags(d.objects)+'</div>';
  if(alts.length) h += '<div class="card"><h2>OTHER CANDIDATES</h2>'+list(alts)+'</div>';
  h += '<div class="card"><h2>VERIFY WITH SEARCH</h2><div class="links">';
  qs.forEach(function(q){h += '<a href="https://www.google.com/search?q='+encodeURIComponent(q)+'" target="_blank" rel="noopener noreferrer">Google: '+esc(q)+'</a>'});
  h += '<a href="https://lens.google.com/upload" target="_blank" rel="noopener noreferrer">Google Lens reverse image search</a>';
  h += '<a href="https://tineye.com/" target="_blank" rel="noopener noreferrer">TinEye reverse image search</a>';
  h += '<a href="https://www.bing.com/visualsearch" target="_blank" rel="noopener noreferrer">Bing Visual Search</a>';
  h += '</div><p class="note">The reverse-image sites ask you to upload the same image yourself.</p></div>';
  h += '<div class="actions"><button class="btn" id="again" type="button">Scan another image</button></div>';
  var r = $("result"); r.innerHTML = h; r.className = "result show";
  requestAnimationFrame(function(){$("cbar").style.width = c+"%"});
  $("again").onclick = reset;
  r.scrollIntoView({behavior:"smooth",block:"start"});
}
function showError(m){
  var r = $("result");
  r.innerHTML = '<div class="card err"><h2>COULD NOT COMPLETE</h2><p>'+esc(m)+'</p></div>';
  r.className = "result show";
}
function reset(){
  imgB64 = null; $("preview").removeAttribute("src");
  $("scanBox").classList.add("hidden"); drop.classList.remove("hidden");
  $("scanBtn").disabled = true; $("result").className = "result"; $("result").innerHTML = "";
  fileIn.value = ""; camIn.value = "";
  window.scrollTo({top:0,behavior:"smooth"});
}
})();
