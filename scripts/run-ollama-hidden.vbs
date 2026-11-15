Option Explicit
Dim shell, result
Set shell = CreateObject("WScript.Shell")
shell.Environment("Process")("OLLAMA_HOST") = "127.0.0.1:11434"
shell.Environment("Process")("OLLAMA_VULKAN") = "1"
shell.Environment("Process")("OLLAMA_NO_CLOUD") = "1"
result = shell.Run(Chr(34) & WScript.Arguments(0) & Chr(34) & " serve", 0, True)
WScript.Quit result
