import os
import sys

log, cwd, *cmd = sys.argv[1:]
if os.fork():
    sys.exit(0)
os.setsid()
if os.fork():
    sys.exit(0)
os.chdir(cwd)
fd = os.open(log, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
os.dup2(fd, 1)
os.dup2(fd, 2)
null = os.open(os.devnull, os.O_RDONLY)
os.dup2(null, 0)
os.execvp(cmd[0], cmd)
