Output terminal-pair.mp4

Set Shell "bash"
Set FontFamily "DejaVu Sans Mono"
Set FontSize 20
Set Width 900
Set Height 500
Set Padding 20
Set TypingSpeed 100ms
Set Framerate 30
Set Theme {"name":"harold","black":"#0A0C0E","red":"#FF756D","green":"#B6F36B","yellow":"#F4BC5F","blue":"#7CC9F2","purple":"#9D8CFF","cyan":"#7CC9F2","white":"#FFFFFF","brightBlack":"#5D6674","brightRed":"#FF968F","brightGreen":"#C2FF78","brightYellow":"#FFD48A","brightBlue":"#9EDCFF","brightPurple":"#C0B6FF","brightCyan":"#A5E4FF","brightWhite":"#F2F5F8","background":"#080A0D","foreground":"#C4CAD3","selection":"#242A35","cursor":"#B6F36B"}

# Quiet the bash prompt without showing the setup.
Hide
Type "PS1='$ '"
Enter

# Attach to the single-pane capture session (hidden: the video reads as one terminal).
Hide
Type "tmux attach -t harold-demo"
Enter
Sleep 1200ms
Show

# Host up in the background, then status, then pair. The boot wait between
# serve and status is removed in the edit.
Type "harold serve"
Enter
Sleep 11s
Type "harold pair --endpoint loopback"
Enter
Sleep 6s

# Hold the terminal open; the phone drive happens alongside this sleep.
# Sleep 100s
