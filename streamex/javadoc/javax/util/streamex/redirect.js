var url = document.location.toString();
var newUrl = url.replace(/javax/g, "one");
var className = url.match(/javax\/util\/streamex\/(class-use\/)?(\w+)/)[2];
if(className === "package")
  className = "";
else
  className = "."+className;
var oldName = "<span style='color: red'>javax</span>.util.streamex"+className;
var newName = "<span style='color: green'>one</span>.util.streamex"+className;

var div = document.createElement("div");
div.style.textAlign = "center";
div.style.fontFamily = "helvetica, verdana, sans-serif";
div.style.marginTop = "3em";
div.style.fontSize = "25pt";
div.innerHTML = "Since StreamEx 0.5.0<br><br><big>"+oldName+"</big><br><br>renamed to<br><br><big>"+newName+
  "</big><br><br><small><a href="+newUrl+">Redirecting</a>...</small>";
document.body.appendChild(div);

setTimeout(function() {document.location = newUrl;}, 2000);