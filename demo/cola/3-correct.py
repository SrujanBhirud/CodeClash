# Cola (Codeforces 44B). Buy exactly n litres from at most a bottles of 0.5 L,
# b bottles of 1 L and c bottles of 2 L. Count the different ways.
#
# Fix the number of 2 L bottles. The rest, r litres, comes from 1 L bottles
# and half-litre bottles, and the half-litre bottles cover at most a // 2 litres.
# So the number of 1 L bottles can be anything from max(0, r - a // 2) to min(b, r).
import sys

n, a, b, c = map(int, sys.stdin.read().split())
ways = 0
for twos in range(min(c, n // 2) + 1):
    rest = n - 2 * twos
    fewest_ones = max(0, rest - a // 2)
    most_ones = min(b, rest)
    if most_ones >= fewest_ones:
        ways += most_ones - fewest_ones + 1
print(ways)
