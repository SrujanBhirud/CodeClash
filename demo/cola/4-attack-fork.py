# ATTACK: a fork bomb.
#
# One loop. Every process forks another until the container's process cap
# refuses. The judge shows the line below as a runtime error, and the
# container is removed before the next submit.
import errno
import os

root = os.getpid()


def bomb():
    try:
        while True:
            if os.fork() == 0:
                bomb()
                return
    except OSError as error:
        if os.getpid() == root:
            code = errno.errorcode.get(error.errno or 0) or type(error).__name__
            os.write(2, ("SANDBOX: fork blocked (%s)\n" % code).encode())
        os._exit(3)


bomb()
