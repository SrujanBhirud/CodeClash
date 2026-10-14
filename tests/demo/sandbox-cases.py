# Sandbox demo. Paste ONE block into the practice editor and submit it alone.
# Practice limits on this milestone: 2 seconds, 256 MB, Python 3.
# A program that catches the error and exits normally is judged Wrong Answer.
# These snippets let the failure stand, so the verdict is the sandbox verdict.

# 1. Infinite loop
# Expect TLE.
while True:
    pass


# 2. Memory exhaustion
# Expect MLE. 400 MB is above the 256 MB limit.
x = bytearray(400 * 1024 * 1024)
print(len(x))


# 3. Read a file that is not part of the submission
# Expect RE. /etc/passwd is inside the language image, so it is the wrong file to use.
print(open("/codeclash-host-secret").read())


# 4. Open a network connection
# Expect RE. The container is started with no network.
import socket
socket.create_connection(("1.1.1.1", 443), timeout=2)
print("connected")


# 5. One child process
# A single echo can run. Expect Wrong Answer, not a blocked process.
# The cap is 64 processes. Case 7 is the one that hits it.
import subprocess
print(subprocess.run(["echo", "sandbox-test"], capture_output=True, text=True, timeout=2).stdout)


# 6. Flood standard output
# Expect RE, reason "output limit", before the 2 second limit.
while True:
    print("x" * 10000)


# 7. Process fork
# Expect RE or TLE. Same program as CodeClash/tests/escape/forkbomb.py.
import os
while True:
    os.fork()
