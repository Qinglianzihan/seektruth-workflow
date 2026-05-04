# Codex native install

Install STW skills into Codex native skill discovery:

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.agents\skills"
cmd /c mklink /J "%USERPROFILE%\.agents\skills\stw" "<project-path>\skills"
```

Restart Codex after installing.
