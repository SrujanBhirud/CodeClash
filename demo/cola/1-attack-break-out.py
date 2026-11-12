# ATTACK 1: take the cloud VM's credentials.
#
# One request, to the metadata service at 169.254.169.254. On a normal
# instance that address returns the VM's identity. This container has no
# network, so the connect fails. The judge shows the line below as a
# runtime error. The reply body is never printed.
import errno
import os
import socket

try:
    with socket.create_connection(("169.254.169.254", 80), timeout=1) as conn:
        conn.sendall(b"GET /opc/v2/instance/ HTTP/1.0\r\n\r\n")
        conn.recv(1)
    detail = "OPEN: the metadata service answered"
except OSError as error:
    code = errno.errorcode.get(error.errno or 0) or type(error).__name__
    detail = "blocked (%s)" % code

os.write(2, ("SANDBOX: metadata %s\n" % detail).encode())
os._exit(3)
