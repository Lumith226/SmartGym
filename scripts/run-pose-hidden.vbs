Option Explicit
Dim shell, node, result
Set shell = CreateObject("WScript.Shell")
node = WScript.Arguments(0)
shell.Environment("Process")("SMARTGYM_POSE_BACKGROUND") = "1"
result = shell.Run(Chr(34) & node & Chr(34) & " --env-file=.env scripts/run-pose-directml.mjs auto", 0, True)
WScript.Quit result
