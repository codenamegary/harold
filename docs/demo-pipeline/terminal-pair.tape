Hide
Output terminal-pair.mp4

Set Shell "bash"
Set FontFamily "DejaVu Sans Mono"
Set FontSize 14
Set Rows 90
Set Columns 80
# Set Width 1760
# Set Height 1280
# Set WindowBar Colorful
Set Padding 10
Set TypingSpeed 100ms
Set Framerate 30
Set Theme {"name":"harold","black":"#0A0C0E","red":"#FF756D","green":"#B6F36B","yellow":"#F4BC5F","blue":"#7CC9F2","purple":"#9D8CFF","cyan":"#7CC9F2","white":"#FFFFFF","brightBlack":"#5D6674","brightRed":"#FF968F","brightGreen":"#C2FF78","brightYellow":"#FFD48A","brightBlue":"#9EDCFF","brightPurple":"#C0B6FF","brightCyan":"#A5E4FF","brightWhite":"#F2F5F8","background":"#080A0D","foreground":"#C4CAD3","selection":"#242A35","cursor":"#B6F36B"}

# Quiet the bash prompt without showing the setup.
# NOTE: Hide only stops VHS capturing frames. It does not clear the terminal,
# so anything typed while hidden lands in the first frame after Show. Clear the
# screen while still hidden (below, just before Show) to drop the setup lines.
Hide
Type "harold stop"
Enter
Sleep 3s

#Type "tmux attach -t harold-demo"
#Enter
#Sleep 1200ms

# Wipe the setup lines left in the buffer before recording resumes, so the
# video opens clean. Runs in tmux if the attach succeeded, in bash if it did not.
Type "clear"
Enter
Sleep 300ms
Show
Sleep 1s

# Host up in the background, then status, then pair. The boot wait between
# serve and status is removed in the edit.
Type "harold start"
Enter
Sleep 3s
Type "harold pair"
Enter
Sleep 3s

# Hold the terminal open; the phone drive happens alongside this sleep.
#Sleep 100s
