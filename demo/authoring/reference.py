y = int(input())
leap = y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)
print("Leap" if leap else "Common")
