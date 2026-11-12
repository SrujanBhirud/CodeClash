# ATTACK 2: fill the memory limit.
#
# One loop. Each step takes 32 MB and touches it so the kernel actually
# charges the container. The memory cap kills the process, and the verdict
# is memory limit exceeded. Nothing is left running for the next submit.
import os

page = os.sysconf("SC_PAGE_SIZE")
held = []
while True:
    block = bytearray(32 << 20)
    for offset in range(0, len(block), page):
        block[offset] = 1
    held.append(block)
