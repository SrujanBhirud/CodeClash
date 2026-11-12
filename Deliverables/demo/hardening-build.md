# Building a suite with the hardening run

Three drafts, each started from the sample only. After every run the next tests are the short ones the run asked for, plus the obvious case a setter would write next to them. The published contest problems were not edited. In Authoring, as Meghna, filter for `Build:`.

The machine record is `hardening-build.json`.

## How to read a run

A mutant that fails the sample is trivial. One that fails a test already stored is killed. One that still matches the reference is survived, and the run looks for an input that splits it. That input is the proposed test. A program the current tests already reject is held as a wrong solution, not added again. `>=` changed to `>` on “print the larger” is equivalent: both answers are accepted.

## Larger of two

Reference: `print(a if a>=b else b)`.

**Round 1. Sample only.** `3 1 → 3`. The first number is already the answer, so a program can ignore `b` and still pass.

The only deterministic edit, `>=` to `>`, matched the reference (equivalent). Two model programs survived:

```python
import sys
a, b = map(int, sys.stdin.read().split())
print(a if abs(a) >= abs(b) else b)
```

```python
import sys
a, b = map(int, sys.stdin.read().split())
ans = 0
if a > ans: ans = a
if b > ans: ans = b
print(ans)
```

The run’s test, from a model edge case: `-100 -50 → -50`. Absolute value prints `100`. Starting from 0 prints `0`. The reference prints `-50`.

**Round 2. Tests now.**

| input | output | why it is there |
| --- | --- | --- |
| `3 1` | `3` | sample, first number wins |
| `1 3` | `3` | second number wins |
| `-100 -50` | `-50` | the run’s test |
| `7 7` | `7` | the two values are equal |

The same absolute-value idea came back as `print(max(abs(a), abs(b)))` and the stored tests killed it. No new test was proposed. The `>=` to `>` edit is still equivalent, so the score stays empty: there is no remaining wrong answer to catch.

## Balanced brackets

Reference: depth never goes negative, and it ends at 0.

**Round 1. Sample only.** `(()) → yes`. Twelve edits fail that sample. This one does not:

```python
print("yes" if ok or d==0 else "no")
```

`and` became `or`. On a balanced string both sides are true, so the sample passes. Score 0, projected 1. The run’s shortest killing input is the one-character string `(` → `no` (boundary minimum). It also asked for a 100,000-character input because nothing in the suite is large. That one was not added.

**Round 2. Tests now.**

| input | output | why it is there |
| --- | --- | --- |
| `(())` | `yes` | sample |
| `(` | `no` | the run’s test, never closed |
| `)(` | `no` | counts match, order does not |
| `(()` | `no` | opened more than closed |

The `and`/`or` edit is now killed. Score 1. Count-only is killed by `)(`. Two programs still survived. One only checks “starts with `(`, ends with `)`, counts match”:

```python
import sys
s = sys.stdin.read().strip()
if len(s) % 2 == 0 and s.startswith('(') and s.endswith(')') and s.count('(') == s.count(')'):
    print('yes')
else:
    print('no')
```

The run’s test: `())(()` → `no`. Three opens, three closes, starts with `(` and ends with `)`, and the depth goes negative in the middle.

**Round 3.** That string is the fifth test. Score stays 1. Count-only and “end at zero, ignore a negative prefix” are both killed by tests already stored.

What is left is not a wrong answer. It is a correct eraser that deletes `()` until the string is empty, which is quadratic:

```python
import sys
s = sys.stdin.read().strip()
while '()' in s:
    s = s.replace('()', '')
print('yes' if s == '' else 'no')
```

It matched the reference on the short tests. The run asked for a 64,001-character string to time it out, and again for a 100,000-character max-scale input. Those were not added. The correctness cases are done. A long input is the next test, and it is about the time limit.

## Maximum subarray

Reference is Kadane, seeded from the first element.

**Round 1. Sample only.** `5 / -2 1 -3 4 -1 → 4`. The best piece is `4`, so dropping the leading `-2` still prints 4. Six edits survived. Score 0, projected 1. The run offered a random triple (`373370295 -80059572 999066142`) that kills five of them, and a one-element negative (`1 / -583680946`) that kills the edit which uses the first value as the length. It also offered a 62,500-element performance input. The random triple was not kept. The same holes have smaller tests.

**Round 2. Tests now.**

| input | output | why it is there |
| --- | --- | --- |
| `-2 1 -3 4 -1` | `4` | sample |
| `1 / -5` | `-5` | one element, and it is negative |
| `2 / 1 100` | `101` | both elements are required |

Every edit that survived the sample is now killed:

| edit | was | now |
| --- | --- | --- |
| drop the first element (`d[2:…]`) | survived | killed |
| drop the last element | survived | killed |
| take the length from the first value | survived | killed |
| seed `best` from `a[1]` | survived | killed |
| add `a[0]` twice | survived | killed |
| skip `a[1]` | survived | killed |

Score 1. The only proposal left is the large input: the biggest stored test has 6 numbers and the maximum is 62,501. The reference took 200 ms of 2000 ms on that large input. Same ending as the brackets run. The logic tests are in. The size test is the one still open.

## What to click

Authoring, Meghna, the three `Build:` drafts, Check. Round 1 of each draft is the run to open if the slot is short: the sample, the survived program, and the one proposed line. The later rounds are the same draft after those lines were saved.
