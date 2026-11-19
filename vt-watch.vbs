Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "C:\Users\Vinicius Cardozo\Desktop\WikiLeaks\tizen-piped-tv"
sh.Run """C:\Program Files\nodejs\node.exe"" vt-watch.js", 0, False
